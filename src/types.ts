import { fileURLToPath } from 'node:url'
import type { ActivityOptions } from '@temporalio/workflow'

export type CreateActivity<TInput = unknown, TOutput = unknown> = (
  input: TInput,
) => TOutput | Promise<TOutput>

export type ActivityConfig<Id extends string = string> = ActivityOptions & {
  id?: Id
}

const ACTIVITY_SELF_SEGMENT = '/temporal-graph-tools/'

export const ACTIVITY_SOURCE_SYMBOL = Symbol.for(
  '@segundoai/temporal-graph-tools/activity-source',
)

type ActivityMetadata = {
  sourceFile?: string
}

export type ConfiguredActivityReference<
  TInput = unknown,
  TOutput = unknown,
  Id extends string = string,
> = {
  activity: CreateActivity<TInput, TOutput>
  config: ActivityConfig<Id>
}

export type ActivityReference<TInput = unknown, TOutput = unknown, Id extends string = string> =
  | CreateActivity<TInput, TOutput>
  | ConfiguredActivityReference<TInput, TOutput, Id>

function captureActivitySource(): string | undefined {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalPrepare = Error.prepareStackTrace

  try {
    Error.prepareStackTrace = (_, structuredStackTrace) => structuredStackTrace

    const error = new Error()

    Error.captureStackTrace(error, createActivity)

    const callsites = error.stack as unknown as NodeJS.CallSite[] | undefined

    if (!callsites) {
      return undefined
    }

    for (const site of callsites) {
      const fileName =
        typeof site.getFileName === 'function' ? site.getFileName.call(site) : undefined
      const scriptName =
        typeof site.getScriptNameOrSourceURL === 'function'
          ? site.getScriptNameOrSourceURL.call(site)
          : undefined
      const resolved = fileName ?? scriptName

      if (!resolved) {
        continue
      }

      const normalized = resolved.startsWith('file:') ? fileURLToPath(resolved) : resolved
      const comparable = normalized.replace(/\\/g, '/').replace(/^file:\/\//, '')

      if (comparable.includes(ACTIVITY_SELF_SEGMENT)) {
        continue
      }

      return normalized
    }

    return undefined
  } finally {
    Error.prepareStackTrace = originalPrepare
  }
}

function recordActivityMetadata(activity: CreateActivity<unknown, unknown>): void {
  if (Reflect.get(activity, ACTIVITY_SOURCE_SYMBOL)) {
    return
  }

  const metadata: ActivityMetadata = {
    sourceFile: captureActivitySource(),
  }

  Reflect.defineProperty(activity, ACTIVITY_SOURCE_SYMBOL, {
    value: metadata,
    configurable: false,
    enumerable: false,
    writable: false,
  })
}

export function getActivitySourceFile(
  activity: CreateActivity<unknown, unknown>,
): string | undefined {
  const metadata = Reflect.get(activity, ACTIVITY_SOURCE_SYMBOL) as ActivityMetadata | undefined

  return metadata?.sourceFile
}

export type ActivityBundle = {
  implementation: CreateActivity<unknown, unknown>
  config?: ActivityConfig
  name?: string
  sourceFile?: string
}

export type WorkflowSourceArtifact = {
  workflowName: string
  workflowSource: string
}

export type WorkflowBuildResult = WorkflowSourceArtifact & {
  activities: Record<string, ActivityBundle>
}

export type TemporalWorkflowBuildOptions = {
  workflowName: string
  activitiesImportPath?: string
  proxyOptions?: ActivityOptions | string
}

export function createActivity<TInput, TOutput>(
  activity: CreateActivity<TInput, TOutput>,
): CreateActivity<TInput, TOutput>
export function createActivity<TInput, TOutput, Id extends string>(
  activity: CreateActivity<TInput, TOutput>,
  config: ActivityConfig<Id>,
): ConfiguredActivityReference<TInput, TOutput, Id>
export function createActivity<TInput, TOutput>(
  activity: CreateActivity<TInput, TOutput>,
  config?: ActivityConfig<string>,
): ActivityReference<TInput, TOutput> {
  recordActivityMetadata(activity as CreateActivity<unknown, unknown>)

  if (!config) {
    return activity
  }

  return {
    activity,
    config,
  }
}

type TupleToObject<Refs> = Refs extends readonly [infer Head, ...infer Tail]
  ? (Head extends ConfiguredActivityReference<never, infer Output, infer Id>
      ? { [K in Id]: Output }
      : Record<never, never>) &
      TupleToObject<
        Tail extends readonly ConfiguredActivityReference<never, unknown, string>[] ? Tail : []
      >
  : object

type Simplify<T> = { [K in keyof T]: T[K] }

export type ParallelOutputs<
  TInput,
  Refs extends readonly ConfiguredActivityReference<TInput, unknown, string>[],
> = Simplify<TupleToObject<Refs>>

export type WorkflowCollectionBuildResult = {
  workflows: WorkflowSourceArtifact[]
  activities: Record<string, ActivityBundle>
}

export {}
