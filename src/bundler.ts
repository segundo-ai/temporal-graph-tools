import { isAbsolute, resolve } from 'node:path'
import type {
  ActivityBundle,
  WorkflowBuildResult,
  WorkflowSourceArtifact,
} from './types.js'
import type { ActivityImplementations } from './workflow-bundler.js'
import { buildWorkflowBundleCode } from './workflow-bundler.js'
import { collectWorkflowBuildResults } from './workflow/collection.js'

export type BundleWorkflowsOptions = {
  filename?: string
  activityBundle?: BundleActivitiesOptions
}

export type BundleWorkflowsResult = {
  activityBundle: BundledActivitiesArtifact
  workflowBundle: { code: string }
}

export type BundleActivitiesOptions = {
  entrypoints?: readonly string[]
  filename?: string
  externals?: readonly string[]
}

export type BundledActivitiesArtifact = {
  filename: string
  code: string
  map?: string
}

type EsbuildApi = typeof import('esbuild')

let cachedEsbuild: EsbuildApi | undefined

async function loadEsbuild(): Promise<EsbuildApi> {
  if (cachedEsbuild) {
    return cachedEsbuild
  }

  const createLoadError = (error: unknown): Error => {
    if (error instanceof Error) {
      error.message = `Failed to load esbuild. Install it as a dependency before calling bundleWorkflows(). Original error: ${error.message}`

      return error
    }

    return new Error(
      `Failed to load esbuild. Install it as a dependency before calling bundleWorkflows(). Original error: ${String(
        error,
      )}`,
    )
  }

  try {
    const esbuildModule = await import('esbuild')

    cachedEsbuild = esbuildModule

    return esbuildModule
  } catch (error) {
    throw createLoadError(error)
  }
}

export async function loadActivitiesFromBundle(
  bundle: BundledActivitiesArtifact,
): Promise<ActivityImplementations> {
  if (!bundle || typeof bundle.code !== 'string' || bundle.code.trim().length === 0) {
    throw new Error('Activity bundle code must be a non-empty string.')
  }

  const source = ensureActivityInlineSourceMap(bundle.code, bundle.map)
  const encoded = Buffer.from(source, 'utf8').toString('base64')
  const moduleUrl = `data:text/javascript;base64,${encoded}`
  const moduleNamespace = (await import(moduleUrl)) as Record<string, unknown>
  const activitiesExport = moduleNamespace.activities

  if (isActivityImplementations(activitiesExport)) {
    return activitiesExport
  }

  const collected: ActivityImplementations = {}

  Object.entries(moduleNamespace).forEach(([key, value]) => {
    if (typeof value === 'function') {
      collected[key] = value as (...args: unknown[]) => unknown
    }
  })

  if (Object.keys(collected).length > 0) {
    return collected
  }

  throw new Error('Activity bundle did not expose an activities object or callable exports.')
}

export async function bundleWorkflows(
  plans: readonly WorkflowBuildResult[],
  options?: BundleWorkflowsOptions,
): Promise<BundleWorkflowsResult> {
  if (plans.length === 0) {
    throw new Error('bundleWorkflows requires at least one workflow plan.')
  }

  const seenWorkflowNames = new Set<string>()

  plans.forEach((plan, index) => {
    const workflowName = typeof plan.workflowName === 'string' ? plan.workflowName.trim() : ''

    if (workflowName.length === 0) {
      throw new Error(
        `Workflow plan at index ${index} is missing a valid workflowName. Provide workflowName when building workflows.`,
      )
    }

    if (seenWorkflowNames.has(workflowName)) {
      throw new Error(
        `Duplicate workflow name detected in bundle: '${workflowName}' at index ${index}. Workflow names must be unique.`,
      )
    }

    seenWorkflowNames.add(workflowName)
  })

  const collection = collectWorkflowBuildResults(plans)
  const activityBundle = await bundleActivitiesWithEsbuild(
    collection.activities,
    options?.activityBundle,
  )
  const filename = options?.filename ?? createBundleFilename(collection.workflows)
  const code = await buildWorkflowBundleCode(collection.workflows, filename)

  return {
    activityBundle,
    workflowBundle: { code },
  }
}

function createBundleFilename(workflows: WorkflowSourceArtifact[]): string {
  const baseName = workflows
    .map((workflow) => workflow.workflowName)
    .filter((name) => typeof name === 'string' && name.trim().length > 0)
    .join('-')
    .trim()
  const sanitizedBase = sanitizeFilenameBase(baseName.length > 0 ? baseName : 'workflow')
  const randomSuffix = Math.random().toString(36).slice(2, 8)

  return `${sanitizedBase}-${randomSuffix}.workflow.js`
}

function sanitizeFilenameBase(candidate: string): string {
  const sanitized = candidate.replace(/[^A-Za-z0-9_.-]/g, '_')

  if (sanitized.length === 0 || /^_+$/.test(sanitized)) {
    return 'workflow'
  }

  return sanitized
}

async function bundleActivitiesWithEsbuild(
  bundles: Record<string, ActivityBundle>,
  options: BundleActivitiesOptions = {},
): Promise<BundledActivitiesArtifact> {
  const entrypoints = normalizeActivityEntrypoints(
    options.entrypoints ?? deriveActivityEntrypoints(bundles),
  )

  if (entrypoints.length === 0) {
    throw new Error('bundleActivities requires at least one entrypoint.')
  }

  const filename = (options.filename ?? 'activities.bundle.mjs').trim()
  const externals = new Set<string>(['@segundoai/temporal-graph-tools'])

  ;(options.externals ?? []).forEach((name) => {
    if (typeof name === 'string' && name.trim().length > 0) {
      externals.add(name.trim())
    }
  })

  const entrySource = createActivitiesEntrySource(entrypoints)
  const esbuild = await loadEsbuild()
  const buildResult = await esbuild.build({
    stdin: {
      contents: entrySource,
      resolveDir: process.cwd(),
      sourcefile: filename,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: ['node18'],
    absWorkingDir: process.cwd(),
    outfile: filename,
    write: false,
    sourcemap: 'inline',
    external: Array.from(externals),
  })
  const jsFile = buildResult.outputFiles?.find(
    (file) => file.path.endsWith('.js') || file.path.endsWith('.mjs'),
  )
  const mapFile = buildResult.outputFiles?.find(
    (file) => file.path.endsWith('.js.map') || file.path.endsWith('.mjs.map'),
  )

  if (!jsFile) {
    throw new Error('Failed to generate activities bundle.')
  }

  return {
    filename,
    code: jsFile.text,
    ...(mapFile ? { map: mapFile.text } : {}),
  }
}

function normalizeActivityEntrypoints(entrypoints: readonly string[]): string[] {
  return entrypoints
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => (isAbsolute(entry) ? entry : resolve(process.cwd(), entry)))
}

function deriveActivityEntrypoints(bundles: Record<string, ActivityBundle>): string[] {
  const paths = new Set<string>()

  Object.values(bundles).forEach((bundle) => {
    if (bundle?.sourceFile) {
      paths.add(bundle.sourceFile)
    }
  })

  if (paths.size === 0) {
    throw new Error(
      'Unable to derive activity sources automatically. Provide activityBundle.entrypoints.',
    )
  }

  return Array.from(paths)
}

function createActivitiesEntrySource(entrypoints: string[]): string {
  const imports = entrypoints
    .map((entry, index) => `import * as module${index} from ${JSON.stringify(entry)};`)
    .join('\n')
  const moduleRefs = entrypoints.map((_, index) => `module${index}`).join(', ')

  return `
${imports}

const merged = {} as Record<string, unknown>;
for (const mod of [${moduleRefs}]) {
  if (!mod || typeof mod !== 'object') {
    continue;
  }
  const candidate = (mod as { activities?: unknown }).activities;
  if (candidate && typeof candidate === 'object') {
    Object.assign(merged, candidate as Record<string, unknown>);
    continue;
  }
  for (const [key, value] of Object.entries(mod)) {
    if (key === 'default' || key === '__esModule') {
      continue;
    }
    if (value && typeof value === 'object' && 'activity' in (value as { activity?: unknown })) {
      const activity = (value as { activity?: unknown }).activity;
      if (typeof activity === 'function') {
        merged[key] = activity;
        continue;
      }
    }
    if (typeof value === 'function') {
      merged[key] = value;
    }
  }
}

export const activities = merged;
`.trimStart()
}

function ensureActivityInlineSourceMap(code: string, map?: string): string {
  const marker = '//# sourceMappingURL=data:application/json;base64,'

  if (!map || code.includes(marker)) {
    return code
  }

  const base64 = Buffer.from(map, 'utf8').toString('base64')

  return `${code}\n${marker}${base64}`
}

function isActivityImplementations(value: unknown): value is ActivityImplementations {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  return Object.values(value).every((entry) => typeof entry === 'function')
}
