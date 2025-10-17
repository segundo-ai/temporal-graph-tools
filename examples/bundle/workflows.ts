import { createActivity, createWorkflowBuilder } from '@segundo/temporal-graph-tools'
import {
  fetchUserProfile,
  logCompletion,
  sendWelcomeEmail,
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
  .then(createActivity(() => console.log('Hello '), { id: 'startGreet' }))
  .then(createActivity(() => console.log('World'), { id: 'finishGreet' }))
  .commit()
