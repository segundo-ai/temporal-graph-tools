import { NativeConnection, NativeConnectionOptions, Worker } from '@temporalio/worker'
import { bundleWorkflows } from '@segundo/temporal-graph-tools'
import { builderHelloWorld, builderOnboarding } from './bundle/workflows'

export function getConnectionOptions(): NativeConnectionOptions {
  return {
    address: process.env.TEMPORAL_ADDRESS,
    apiKey: process.env.TEMPORAL_API_KEY,
    tls: {},
  }
}

async function run() {
  const { activities, workflowBundle } = await bundleWorkflows([
    builderHelloWorld,
    builderOnboarding,
  ])

  const connection = await NativeConnection.connect(getConnectionOptions())
  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE,
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'default',
    activities,
    workflowBundle,
  })

  await worker.run()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
