import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { bundleWorkflowCode } from '@temporalio/worker'
import type {
  WorkflowBuildResult,
  WorkflowSourceArtifact,
} from '@segundo/temporal-graph-tools/types'

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
  const tempDir = mkdtempSync(join(process.cwd(), '.tmp-temporal-workflow-'))
  const workflows = normalizeWorkflows(workflow)
  const usedFileNames = new Set<string>()
  const moduleSpecifiers: string[] = []

  workflows.forEach((entry, index) => {
    const fileName =
      workflows.length === 1
        ? 'workflow.ts'
        : ensureUniqueFileName(
            sanitizeFileName(entry.workflowName ?? `workflow_${index}`),
            usedFileNames,
          )
    const filePath = join(tempDir, fileName)

    writeFileSync(filePath, `${entry.workflowSource}\n`)
    moduleSpecifiers.push(`./${stripExtension(fileName)}`)
  })

  const entrypointPath = join(tempDir, 'index.ts')
  const entrypointSource =
    moduleSpecifiers.map((specifier) => `export * from '${specifier}'`).join('\n') + '\n'

  writeFileSync(entrypointPath, entrypointSource)

  try {
    const { code } = await bundleWorkflowCode({ workflowsPath: entrypointPath })
    const normalized = ensureInlineSourceMap(code, filename)

    return normalized
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
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
