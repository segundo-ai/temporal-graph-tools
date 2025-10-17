# @segundoai/temporal-graph-tools

TypeScript utilities for assembling Temporal workflows from plain activity
functions. Build a workflow plan, capture the generated source code, hydrate
activity implementations, and bundle everything for a worker without
hand-writing workflow files.

## Highlights

- Fluent builder for chaining sequential steps and running activity stages in
  parallel with type-safe input/output propagation.
- Automatic activity key generation and optional per-activity configuration so
  the generated workflow source stays deterministic.
- One-call bundler that validates multiple plans, hydrates activities, and
  produces bundled workflow code ready for a worker.
- Emits Temporal workflow source that proxies activities and stitches staged
  plans together.
- Low-level helpers remain available if you prefer to collect results, build
  bundles, or hydrate activities manually.

## Installation

```bash
npm install @segundoai/temporal-graph-tools
# or
pnpm add @segundoai/temporal-graph-tools
# or
bun add @segundoai/temporal-graph-tools
```

The package targets Node.js 18+ and ships ESM builds.

## Quick start

```ts
import {
  bundleWorkflows,
  createActivity,
  createWorkflowBuilder,
} from '@segundoai/temporal-graph-tools'

type FetchUserInput = { userId: string }
type FetchUserOutput = { profile: { id: string; name: string } }

const fetchUserProfile = createActivity(
  async ({ userId }: FetchUserInput): Promise<FetchUserOutput> => {
    return { profile: { id: userId, name: `User ${userId}` } }
  },
  { id: 'fetchUserProfile' },
)

const sendWelcomeEmail = createActivity(
  async ({ profile }: FetchUserOutput) => {
    return { sent: true, name: profile.name }
  },
  { id: 'sendWelcomeEmail' },
)

async function compile() {
  const builder = createWorkflowBuilder<FetchUserInput>({
    workflowName: 'customerOnboardingWorkflow',
    proxyOptions: { startToCloseTimeout: '2 minutes' },
  })

  const plan = builder.then(fetchUserProfile).then(sendWelcomeEmail).commit()
  const { activities, workflowBundle } = await bundleWorkflows([plan])

  // Use the emitted artifacts with a Temporal worker
  return { workflowBundle, activities }
}
```

See the complete onboarding example in `examples/` for a richer flow that uses a
parallel stage and hooks a worker up to the generated artifacts.

### Example scripts

After installing dependencies you can explore the sample project:

```bash
bun install
bun run worker              # Starts a Temporal worker (needs a Temporal cluster)
bun run trigger-workflows   # Launches the sample workflows through the client
```

Set `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, and `TEMPORAL_TASK_QUEUE` in
`.env` to point the worker at your cluster. Use `bun run trigger-workflows` to
start the compiled workflows through the Temporal client once the worker is
running.

## Workflow builder API

### `createWorkflowBuilder<TInput>(options)`

Creates a `WorkflowBuilder` instance typed with the initial workflow input.
`options` must include:

- `workflowName`: Name of the exported workflow function. This value must be a
  non-empty string and unique across the plans you later bundle.

Optional fields:

- `activitiesImportPath`: Module specifier used in the generated workflow import
  (`'./activities'` by default).
- `proxyOptions`: Either a `@temporalio/workflow` `ActivityOptions` object or a
  string literal dropped into the generated code. If omitted, a one-minute
  `startToCloseTimeout` is emitted.

### `builder.then(activity, config?)`

Appends a sequential activity. The helper accepts either a bare activity
function or a value created with `createActivity`. When both inline and
preconfigured options are provided they are merged; `config.id` determines the
activity key.

### `builder.parallel([activityA, activityB, ...])`

Executes multiple activities against the current stage output and returns an
object keyed by each activity's `id`. A parallel stage can only be added after
at least one `then` call.

### `builder.commit(options?)`

Finalises the plan and returns:

- `workflowName`: The sanitized name of the exported workflow function.
- `workflowSource`: Generated TypeScript for the Temporal workflow function.
- `activities`: Map of activity keys to the original implementations and config
  metadata. Implementations remain live references so any captured helpers stay
  intact.

Additional `options` override the builder defaults for this invocation.

## Activity helpers

### `createActivity(activityFn, config?)`

Wraps an activity function so it can be reused with the builder. When a config
object is provided its `id` becomes the activity key; without options the
function name (or an auto-incremented fallback) is used. The helper is also
re-exported as `createActivity` for codebases that prefer plural naming.

## Workflow bundler utilities

### `bundleWorkflows(plans, options?)`

High-level helper that accepts one or more `WorkflowBuildResult` instances,
validates them, hydrates all activities, and bundles the generated workflow
sources. Returns:

- `activities`: Map of activity keys to runnable implementations.
- `workflowBundle`: Object containing the bundled JavaScript (in `code`) with an
  inline source map.

Use this when you want a single call that prepares everything for a Temporal
worker. Under the hood it relies on the lower-level helpers documented below.

```ts
const plans = [onboardingPlan, greetingPlan]
const { activities, workflowBundle } = await bundleWorkflows(plans, {
  filename: 'team-workflows.js',
})
```

### `collectWorkflowBuildResults(results)`

Merges the output of multiple `builder.commit()` calls into a single object.
Workflow names must be unique (duplicates are rejected), and activity IDs either
unique or guaranteed to have identical implementation/config pairs. The result
can feed directly into `instantiateActivities` or `buildWorkflowBundleCode`.

### `instantiateActivities(bundles)`

Accepts the `activities` map returned by `builder.commit()` (or
`collectWorkflowBuildResults`) and produces actual implementations. Each entry
is the original function reference supplied to the builder, so any captured
state remains intact.

### `buildWorkflowBundleCode(source, filename?)`

Runs Temporal's `bundleWorkflowCode` against the generated workflow source(s)
and returns bundled JavaScript with an inline source map. `source` can be:

- A raw workflow source string (preserved for backward compatibility).
- A single `WorkflowBuildResult` or `WorkflowSourceArtifact`.
- An array of `WorkflowSourceArtifact` values (for multiple workflows).

`filename` controls the `file` attribute recorded in the map. When omitted the
helper generates deterministic filenames per workflow and normalizes the map so
Temporal tooling can attribute stack traces correctly.

## Development

```bash
bun install
bun run type-check
bun run lint
bun run build
```

## License

MIT
