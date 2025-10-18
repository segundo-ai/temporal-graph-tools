import { createActivity, createWorkflowBuilder } from '@segundoai/temporal-graph-tools'
import {
  endGreet,
  fetchUserProfile,
  logCompletion,
  sendWelcomeEmail,
  startGreet,
  syncCrmRecord,
  type FetchUserInput,
} from './activities'

export const builderOnboarding = createWorkflowBuilder<FetchUserInput>({
  workflowName: 'customerOnboardingWorkflow',
  proxyOptions: { startToCloseTimeout: '2 minutes' },
})
  .then(fetchUserProfile)
  .parallel([sendWelcomeEmail, syncCrmRecord])
  .then(logCompletion)
  .commit()

export const builderHelloWorld = createWorkflowBuilder<void>({ workflowName: 'greetWorkflow' })
  .then(startGreet)
  .then(endGreet)
  .commit()
