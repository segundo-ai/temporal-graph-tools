import * as realFS from 'node:fs'
import path, { basename } from 'node:path'
import {
  WorkflowCodeBundler,
  type WorkflowBundleWithSourceMap,
} from '@temporalio/worker/lib/workflow/bundler'
import { createFsFromVolume, Volume } from 'memfs'
import type { IFs } from 'memfs'
import { Union, ufs } from 'unionfs'
import type { IFS, IUnionFs } from 'unionfs'
import type {
  WorkflowBuildResult,
  WorkflowSourceArtifact,
} from '@segundoai/temporal-graph-tools/types'

export type ActivityImplementations = Record<string, (...args: unknown[]) => unknown>

export type ActivityBundles = WorkflowBuildResult['activities']

export async function instantiateActivities(
  bundles: ActivityBundles,
): Promise<ActivityImplementations> {
  const implementations: ActivityImplementations = {}

  Object.entries(bundles).forEach(([key, bundle]) => {
    implementations[key] = bundle.implementation
  })

  return implementations
}

export async function buildWorkflowBundleCode(
  workflow: string | WorkflowSourceArtifact | WorkflowSourceArtifact[],
  filename = 'workflow.js',
): Promise<string> {
  const workflows = normalizeWorkflows(workflow)
  const bundler = new VirtualWorkflowCodeBundler(workflows)
  const { code } = await bundler.createBundle()

  return ensureInlineSourceMap(code, filename)
}

function normalizeWorkflows(
  workflow: string | WorkflowSourceArtifact | WorkflowSourceArtifact[],
): WorkflowSourceArtifact[] {
  if (Array.isArray(workflow)) {
    if (workflow.length === 0) {
      throw new Error('buildWorkflowBundleCode requires at least one workflow source.')
    }

    return workflow
  }

  if (typeof workflow === 'string') {
    return [
      {
        workflowName: 'workflow',
        workflowSource: workflow,
      },
    ]
  }

  return [workflow]
}

function sanitizeFileName(candidate: string): string {
  const base = candidate.trim().replace(/[^A-Za-z0-9_.-]/g, '_')

  if (base.length > 0 && !/^_+$/.test(base)) {
    return `${base}.ts`
  }

  return 'workflow.ts'
}

function ensureUniqueFileName(baseName: string, used: Set<string>): string {
  let candidate = baseName
  let counter = 1

  while (used.has(candidate)) {
    const dotIndex = baseName.lastIndexOf('.')
    const prefix = dotIndex > 0 ? baseName.slice(0, dotIndex) : baseName
    const extension = dotIndex > 0 ? baseName.slice(dotIndex) : ''

    candidate = `${prefix}_${counter++}${extension}`
  }

  used.add(candidate)

  return candidate
}

function stripExtension(fileName: string): string {
  const parsed = basename(fileName)

  if (parsed.endsWith('.ts')) {
    return parsed.slice(0, -3)
  }

  return parsed
}

function ensureInlineSourceMap(code: string, filename: string): string {
  const marker = '//# sourceMappingURL=data:application/json;base64,'

  if (!code.includes(marker)) {
    const stubMap = {
      version: 3,
      file: filename,
      sources: ['workflow.ts'],
      sourcesContent: [code],
      names: [] as string[],
      mappings: '',
    }
    const base64 = Buffer.from(JSON.stringify(stubMap)).toString('base64')

    return `${code}\n${marker}${base64}`
  }

  const markerIndex = code.lastIndexOf(marker)
  const base64 = code.slice(markerIndex + marker.length).trim()
  const decoded = Buffer.from(base64, 'base64').toString('utf8')
  const sourceMap = JSON.parse(decoded) as { file?: string; sources?: string[] }

  if (!sourceMap.file || sourceMap.file.length === 0) {
    sourceMap.file = filename
  }

  if (!Array.isArray(sourceMap.sources) || sourceMap.sources.length === 0) {
    sourceMap.sources = [filename]
  }

  const updatedBase64 = Buffer.from(JSON.stringify(sourceMap)).toString('base64')

  return code.slice(0, markerIndex + marker.length) + updatedBase64
}

class VirtualWorkflowCodeBundler extends WorkflowCodeBundler {
  private static readonly virtualRoot = path.join(
    process.cwd(),
    '__temporal_virtual__',
    'workflows',
  )

  private readonly workflows: WorkflowSourceArtifact[]
  private readonly virtualEntrypoint: string

  constructor(workflows: WorkflowSourceArtifact[]) {
    const entry = path.join(VirtualWorkflowCodeBundler.virtualRoot, 'index.ts')

    super({ workflowsPath: entry })

    this.workflows = workflows
    this.virtualEntrypoint = entry
  }

  public async createBundle(): Promise<WorkflowBundleWithSourceMap> {
    const volume = new Volume()
    const unionFs: IUnionFs = new Union()

    this.populateVirtualWorkflows(volume)
    const readdir = Object.assign(
      (...params: Parameters<typeof realFS.readdir>) => {
        const args = [...params];
        const callbackCandidate = args.pop();

        if (typeof callbackCandidate !== 'function') {
          return realFS.readdir(...params);
        }

        const callback = callbackCandidate as (
          err: NodeJS.ErrnoException | null,
          files: unknown,
        ) => void;
        const wrappedCallback = (
          err: NodeJS.ErrnoException | null,
          files: unknown,
        ): void => {
          if (err !== null) {
            callback(err, files);
            
            return;
          }

          if (!Array.isArray(files)) {
            callback(null, files);
            
            return;
          }

          if (!files.every((entry) => typeof entry === 'string')) {
            callback(null, files);
            
            return;
          }

          const typedFiles = files as string[]
          const filtered = typedFiles.filter(
            (file) => /\.[jt]s$/.test(path.extname(file)) && !file.endsWith('.d.ts'),
          )

          callback(null, filtered)
        };

        const patchedArgs = [...args, wrappedCallback] as Parameters<typeof realFS.readdir>

        return realFS.readdir(...patchedArgs)
      },
      { __promisify__: realFS.readdir.__promisify__ },
    ) as typeof realFS.readdir
    const memoryFs = createFsFromVolume(volume)
    const layeredFs = { ...realFS, readdir } as unknown as IFs

    unionFs.use(memoryFs as unknown as IFS)
    unionFs.use(layeredFs as unknown as IFS)

    const distDir = '/dist'
    const entrypointPath = this.makeEntrypointPath(
      unionFs as unknown as typeof ufs,
      this.virtualEntrypoint,
    )

    this.genEntrypoint(volume, entrypointPath)

    const bundleFilePath = await this.bundle(
      unionFs as unknown as typeof ufs,
      memoryFs,
      entrypointPath,
      distDir,
    )
    let code = memoryFs.readFileSync(bundleFilePath, 'utf8') as string

    code = code.replace(
      'var __webpack_module_cache__ = {}',
      'var __webpack_module_cache__ = globalThis.__webpack_module_cache__',
    )

    const sizeInMb = `${(code.length / (1024 * 1024)).toFixed(2)}MB`

    this.logger.info('Workflow bundle created', { size: sizeInMb })

    return {
      sourceMap: 'deprecated: this is no longer in use\n',
      code,
    }
  }

  private populateVirtualWorkflows(volume: Volume): void {
    const usedFileNames = new Set<string>()
    const moduleSpecifiers: string[] = []
    const baseDir = VirtualWorkflowCodeBundler.virtualRoot

    this.workflows.forEach((entry, index) => {
      const fileName =
        this.workflows.length === 1
          ? 'workflow.ts'
          : ensureUniqueFileName(
              sanitizeFileName(entry.workflowName ?? `workflow_${index}`),
              usedFileNames,
            )
      const filePath = path.join(baseDir, fileName)

      volume.mkdirSync(path.dirname(filePath), { recursive: true })
      volume.writeFileSync(filePath, `${entry.workflowSource}\n`)
      moduleSpecifiers.push(`./${stripExtension(fileName)}`)
    })

    const entrySource =
      moduleSpecifiers.map((specifier) => `export * from '${specifier}'`).join('\n') + '\n'

    volume.mkdirSync(path.dirname(this.virtualEntrypoint), { recursive: true })
    volume.writeFileSync(this.virtualEntrypoint, entrySource)
  }
}
