import type {
  WorkflowBuildResult,
  WorkflowSourceArtifact,
} from '@segundoai/temporal-graph-tools/types'
import type { ActivityImplementations } from '@segundoai/temporal-graph-tools/workflow-bundler'
import {
  buildWorkflowBundleCode,
  instantiateActivities,
} from '@segundoai/temporal-graph-tools/workflow-bundler'
import { collectWorkflowBuildResults } from '@segundoai/temporal-graph-tools/workflow/collection'

export type BundleWorkflowsOptions = {
  filename?: string
}

export type BundleWorkflowsResult = {
  activities: ActivityImplementations
  workflowBundle: { code: string }
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
  const activities = await instantiateActivities(collection.activities)
  const filename = options?.filename ?? createBundleFilename(collection.workflows)
  const code = await buildWorkflowBundleCode(collection.workflows, filename)

  return {
    activities,
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
