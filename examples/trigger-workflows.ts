import { Connection, WorkflowClient } from '@temporalio/client'
import { builderHelloWorld, builderOnboarding } from './bundle/workflows'

const DEFAULT_NAMESPACE = 'default'
const DEFAULT_TASK_QUEUE = 'default'

async function run(): Promise<void> {
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
    tls: process.env.TEMPORAL_API_KEY ? {} : undefined,
    apiKey: process.env.TEMPORAL_API_KEY,
  })

  const client = new WorkflowClient({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? DEFAULT_NAMESPACE,
  })
  console.log(builderOnboarding.workflowName)

  const [onboardingHandle, greetHandle] = await Promise.all([
    client.start(builderOnboarding.workflowName, {
      taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? DEFAULT_TASK_QUEUE,
      workflowId: `customer-onboarding-${Date.now()}`,
      args: [{ userId: 'user-123' }],
    }),
    client.start(builderHelloWorld.workflowName, {
      taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? DEFAULT_TASK_QUEUE,
      workflowId: `greet-${Date.now()}`,
      args: [{ userId: 'user-123' }],
    }),
  ])

  console.log('Onboarding Workflow started:', {
    workflowId: onboardingHandle.workflowId,
    runId: onboardingHandle.firstExecutionRunId,
  })
  console.log('Greet Workflow started:', {
    workflowId: greetHandle.workflowId,
    runId: greetHandle.firstExecutionRunId,
  })
  const result = await Promise.all([onboardingHandle.result(), greetHandle.result()])

  console.log('Workflows completed with result:', result)

  await connection.close()
}

run().catch((error) => {
  console.error('Failed to run workflow example:', error)
  process.exitCode = 1
})
