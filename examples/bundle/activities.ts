import { createActivity } from '@segundoai/temporal-graph-tools'

export type FetchUserInput = { userId: string }

export const fetchUserProfile = createActivity(
  async (input: FetchUserInput): Promise<FetchUserOutput> => {
    console.log(`[fetchUserProfile] fetching ${input.userId}`)
    return {
      profile: {
        id: input.userId,
        name: `User ${input.userId.slice(0, 6)}`,
      },
    }
  },
  {
    id: 'fetchUserProfile',
  },
)

export const sendWelcomeEmail = createActivity(
  async ({ profile }: FetchUserOutput): Promise<{ sent: boolean }> => {
    console.log(`[sendWelcomeEmail] sent email to ${profile.name}`)
    return { sent: true }
  },
  {
    id: 'sendWelcomeEmail',
  },
)

export type UserProfile = { id: string; name: string }
export type FetchUserOutput = { profile: UserProfile }

export const syncCrmRecord = createActivity(
  async ({ profile }: FetchUserOutput): Promise<{ synced: boolean }> => {
    console.log(`[syncCrmRecord] synced record ${profile.id}`)
    return { synced: true }
  },
  {
    id: 'syncCrmRecord',
  },
)

export type ParallelResult = {
  sendWelcomeEmail: { sent: boolean }
  syncCrmRecord: { synced: boolean }
}

export const logCompletion = createActivity(
  async (result: ParallelResult): Promise<void> => {
    console.log(
      `[logCompletion] email sent=${result.sendWelcomeEmail.sent}, crm synced=${result.syncCrmRecord.synced}`,
    )
  },
  {
    id: 'logCompletion',
  },
)
