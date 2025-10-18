import type {
  ActivityBundle,
  WorkflowBuildResult,
  WorkflowCollectionBuildResult,
  WorkflowSourceArtifact,
} from '@segundoai/temporal-graph-tools/types'
import { deepEqual } from '@segundoai/temporal-graph-tools/utils/deep-equal'

export function collectWorkflowBuildResults(
  results: readonly WorkflowBuildResult[],
): WorkflowCollectionBuildResult {
  if (results.length === 0) {
    throw new Error('collectWorkflowBuildResults requires at least one workflow build result.')
  }

  const workflows: WorkflowSourceArtifact[] = []
  const activities: Record<string, ActivityBundle> = {}
  const workflowNames = new Set<string>()

  results.forEach((result, index) => {
    if (workflowNames.has(result.workflowName)) {
      throw new Error(
        `Duplicate workflow name detected at index ${index}: '${result.workflowName}'. Workflow names must be unique.`,
      )
    }

    workflowNames.add(result.workflowName)
    workflows.push({
      workflowName: result.workflowName,
      workflowSource: result.workflowSource,
    })

    Object.entries(result.activities).forEach(([key, bundle]) => {
      const existing = activities[key]

      if (!existing) {
        activities[key] = bundle

        return
      }

      const configMatches = deepEqual(existing.config ?? undefined, bundle.config ?? undefined)
      const sourceMatches = (existing.sourceFile ?? null) === (bundle.sourceFile ?? null)

      if (
        existing.implementation !== bundle.implementation ||
        !configMatches ||
        (existing.name ?? null) !== (bundle.name ?? null) ||
        !sourceMatches
      ) {
        throw new Error(
          `Activity '${key}' is defined multiple times with conflicting implementations.`,
        )
      }
    })
  })

  return {
    workflows,
    activities,
  }
}
