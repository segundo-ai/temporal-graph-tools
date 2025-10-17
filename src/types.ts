import type { ActivityOptions } from '@temporalio/workflow'

export type CreateActivity<TInput = unknown, TOutput = unknown> = (
  input: TInput,
) => TOutput | Promise<TOutput>

export type ActivityConfig<Id extends string = string> = ActivityOptions & {
  id?: Id
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

export type ActivityBundle = {
  implementation: CreateActivity<unknown, unknown>
  config?: ActivityConfig
  name?: string
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
