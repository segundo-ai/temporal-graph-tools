import type {
  ActivityBundle,
  ActivityConfig,
  ActivityReference,
  ConfiguredActivityReference,
  CreateActivity,
  ParallelOutputs,
  TemporalWorkflowBuildOptions,
  WorkflowBuildResult,
} from '@segundoai/temporal-graph-tools/types'
import { deepEqual } from '@segundoai/temporal-graph-tools/utils/deep-equal'
import type { ActivityOptions } from '@temporalio/workflow'

type NormalizedStep = {
  key: string
}

type Stage = { type: 'step'; step: NormalizedStep } | { type: 'parallel'; steps: NormalizedStep[] }

type RegisteredEntry = {
  activity: CreateActivity<unknown, unknown>
  config: ActivityConfig
}

export class WorkflowBuilder<TCurrentOutput> {
  private readonly activityBundles: Record<string, ActivityBundle> = {}

  private readonly plan: Stage[] = []

  private readonly baseOptions: TemporalWorkflowBuildOptions

  private started = false

  private autoIncrement = 0

  constructor(options: TemporalWorkflowBuildOptions) {
    const workflowName = options?.workflowName

    if (typeof workflowName !== 'string' || workflowName.trim().length === 0) {
      throw new Error(
        'createWorkflowBuilder requires options.workflowName to be a non-empty string.',
      )
    }

    this.baseOptions = {
      ...options,
      workflowName: workflowName.trim(),
    }
  }

  then<TNextOutput>(
    reference: ActivityReference<TCurrentOutput, TNextOutput>,
    config?: ActivityConfig,
  ): WorkflowBuilder<TNextOutput> {
    const entry = this.normalizeActivityReference(reference, config)
    const normalized = this.registerActivity(entry)

    this.plan.push({ type: 'step', step: normalized })
    this.started = true

    return this as unknown as WorkflowBuilder<TNextOutput>
  }

  parallel<
    const References extends readonly ConfiguredActivityReference<
      TCurrentOutput,
      unknown,
      string
    >[],
  >(references: References): WorkflowBuilder<ParallelOutputs<TCurrentOutput, References>> {
    this.assertStarted('parallel')

    if (!Array.isArray(references) || references.length === 0) {
      throw new Error('parallel() requires at least one activity reference.')
    }

    const normalized = references.map((ref) =>
      this.registerActivity(this.normalizeActivityReference(ref)),
    )

    this.plan.push({ type: 'parallel', steps: normalized })
    this.started = true

    return this as unknown as WorkflowBuilder<ParallelOutputs<TCurrentOutput, References>>
  }

  commit(): WorkflowBuildResult {
    if (!this.started) {
      throw new Error('Cannot build a workflow without any steps. Call then() before build().')
    }

    const { source: workflowSource, workflowName } = this.generateTemporalWorkflowSource({
      ...this.baseOptions,
    })

    return {
      workflowName,
      activities: { ...this.activityBundles },
      workflowSource,
    }
  }

  private normalizeActivityReference<TInput, TOutput>(
    reference: ActivityReference<TInput, TOutput>,
    inlineConfig?: ActivityConfig,
  ): RegisteredEntry {
    if (typeof reference === 'function') {
      return {
        activity: reference as CreateActivity<unknown, unknown>,
        config: { ...(inlineConfig ?? {}) },
      }
    }

    return {
      activity: reference.activity as CreateActivity<unknown, unknown>,
      config: { ...(reference.config ?? {}), ...(inlineConfig ?? {}) },
    }
  }

  private registerActivity(entry: RegisteredEntry): NormalizedStep {
    const baseKey = entry.config.id ?? this.deriveActivityKey(entry.activity)
    const key = this.assignActivityKey(baseKey, entry)

    return { key }
  }

  private createActivityBundle(entry: RegisteredEntry, key: string): ActivityBundle {
    const config = this.prepareConfig(entry.config)
    const name = entry.activity.name?.trim()

    return {
      implementation: entry.activity,
      ...(name ? { name } : { name: key }),
      ...(config ? { config } : {}),
    }
  }

  private prepareConfig(config: ActivityConfig): ActivityConfig | undefined {
    const entries = Object.entries(config).filter(([, value]) => value !== undefined)

    if (entries.length === 0) {
      return undefined
    }

    return Object.fromEntries(entries) as ActivityConfig
  }

  private generateTemporalWorkflowSource(options: TemporalWorkflowBuildOptions): {
    workflowName: string
    source: string
  } {
    const topLevelIdentifiers = new Set<string>()
    const workflowName = this.ensureUniqueIdentifier(
      options.workflowName,
      options.workflowName,
      topLevelIdentifiers,
    )
    const activitiesIdentifier = this.ensureUniqueIdentifier(
      'activities',
      'activities',
      topLevelIdentifiers,
    )
    const activitiesImportPath = options.activitiesImportPath ?? './activities'
    const proxyOptionsLiteral = this.formatProxyOptions(options.proxyOptions)
    const lines: string[] = []

    lines.push(`import { proxyActivities } from '@temporalio/workflow'`)
    lines.push(`import type { Activities } from '${activitiesImportPath}'`)
    lines.push('')
    lines.push(
      `const ${activitiesIdentifier} = proxyActivities<Activities>(${proxyOptionsLiteral})`,
    )
    lines.push('')
    lines.push(`export async function ${workflowName}(input: unknown): Promise<unknown> {`)

    let currentValue = 'input'
    const localIdentifiers = new Set<string>(['input'])

    this.plan.forEach((stage, stageIndex) => {
      if (stage.type === 'step') {
        const resultVar = this.ensureUniqueIdentifier(
          undefined,
          `step${stageIndex}`,
          localIdentifiers,
        )

        lines.push(
          `  const ${resultVar} = await ${activitiesIdentifier}.${stage.step.key}(${currentValue});`,
        )
        lines.push('')

        currentValue = resultVar

        return
      }

      const individualVars = stage.steps.map((step, index) =>
        this.ensureUniqueIdentifier(undefined, `parallel${stageIndex}_${index}`, localIdentifiers),
      )

      lines.push(`  const [${individualVars.join(', ')}] = await Promise.all([`)
      stage.steps.forEach((step, index) => {
        const suffix = index === stage.steps.length - 1 ? '' : ','

        lines.push(`    ${activitiesIdentifier}.${step.key}(${currentValue})${suffix}`)
      })
      lines.push('  ])')

      const aggregateVar = this.ensureUniqueIdentifier(
        undefined,
        `parallel${stageIndex}`,
        localIdentifiers,
      )

      lines.push(`  const ${aggregateVar} = {`)
      stage.steps.forEach((step, index) => {
        const propertyKey = this.formatPropertyKey(step.key)

        lines.push(`    ${propertyKey}: ${individualVars[index]},`)
      })
      lines.push('  }')
      lines.push('')

      currentValue = aggregateVar
    })

    lines.push(`  return ${currentValue};`)
    lines.push('}')

    return {
      workflowName,
      source: lines.join('\n'),
    }
  }

  private formatProxyOptions(options?: ActivityOptions | string): string {
    if (typeof options === 'string' && options.trim().length > 0) {
      return options.trim()
    }

    if (options === undefined) {
      return `{
  startToCloseTimeout: '1 minute',
}`
    }

    return JSON.stringify(options, null, 2)
  }

  private ensureUniqueIdentifier(
    raw: string | undefined,
    fallback: string,
    used: Set<string>,
  ): string {
    const fallbackValue = fallback || 'value'
    const base = raw && raw.trim().length > 0 ? raw.trim() : fallbackValue
    let sanitized = base.replace(/[^A-Za-z0-9_]/g, '_')

    if (!/^[A-Za-z_]/.test(sanitized)) {
      sanitized = `_${sanitized}`
    }

    if (sanitized.length === 0 || /^_+$/.test(sanitized)) {
      sanitized = fallbackValue.replace(/[^A-Za-z0-9_]/g, '_')

      if (!/^[A-Za-z_]/.test(sanitized)) {
        sanitized = `_${sanitized}`
      }

      if (sanitized.length === 0 || /^_+$/.test(sanitized)) {
        sanitized = 'value'
      }
    }

    let candidate = sanitized
    let counter = 1

    while (used.has(candidate)) {
      candidate = `${sanitized}_${counter++}`
    }

    used.add(candidate)

    return candidate
  }

  private formatPropertyKey(key: string): string {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      return key
    }

    return `'${key.replace(/'/g, "\\'")}'`
  }

  private assignActivityKey(candidate: string, entry: RegisteredEntry): string {
    const normalized = this.normalizeActivityKey(candidate)
    const existing = this.activityBundles[normalized]
    const initialBundle = this.createActivityBundle(entry, normalized)

    if (!existing) {
      this.activityBundles[normalized] = initialBundle

      return normalized
    }

    if (this.activityBundlesEqual(existing, initialBundle)) {
      return normalized
    }

    let counter = 1

    while (true) {
      const nextKey = `${normalized}_${counter++}`
      const nextBundle = this.createActivityBundle(entry, nextKey)
      const existingBundle = this.activityBundles[nextKey]

      if (!existingBundle) {
        this.activityBundles[nextKey] = nextBundle

        return nextKey
      }

      if (this.activityBundlesEqual(existingBundle, nextBundle)) {
        return nextKey
      }
    }
  }

  private normalizeActivityKey(candidate: string): string {
    const key = candidate.trim()

    if (key.length === 0) {
      throw new Error('Activity keys must be non-empty strings.')
    }

    return key
  }

  private activityBundlesEqual(existing: ActivityBundle, candidate: ActivityBundle): boolean {
    const configsEqual = deepEqual(existing.config ?? undefined, candidate.config ?? undefined)
    const namesEqual = (existing.name ?? null) === (candidate.name ?? null)

    return existing.implementation === candidate.implementation && configsEqual && namesEqual
  }

  private deriveActivityKey(activity: CreateActivity<unknown, unknown>): string {
    const candidate = activity.name?.trim()

    if (candidate) {
      return candidate
    }

    this.autoIncrement += 1

    return `step_${this.autoIncrement}`
  }

  private assertStarted(method: string): void {
    if (!this.started) {
      throw new Error(`Cannot call ${method}() before defining the first step.`)
    }
  }
}

export const createWorkflowBuilder = <TInitialInput>(
  options: TemporalWorkflowBuildOptions,
): WorkflowBuilder<TInitialInput> => {
  return new WorkflowBuilder<TInitialInput>(options)
}
