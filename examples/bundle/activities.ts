import kebabCase from 'lodash/kebabCase.js'
import {
  createActivity,
  type ActivityReference,
  type CreateActivity,
} from '@segundoai/temporal-graph-tools'

export type FetchUserInput = { userId: string }

export const fetchUserProfile = createActivity(
  async (input: FetchUserInput): Promise<FetchUserOutput> => {
    const profileName = `User ${input.userId.slice(0, 6)}`
    const slug = kebabCase(profileName)

    console.log(`[fetchUserProfile] fetching ${input.userId} as ${slug}`)
    return {
      profile: {
        id: input.userId,
        name: profileName,
        slug,
      },
    }
  },
  {
    id: 'fetchUserProfile',
  },
)

export const sendWelcomeEmail = createActivity(
  async ({ profile }: FetchUserOutput): Promise<{ sent: boolean; recipientSlug: string }> => {
    console.log(`[sendWelcomeEmail] sent email to ${profile.name} (${profile.slug})`)
    return { sent: true, recipientSlug: profile.slug }
  },
  {
    id: 'sendWelcomeEmail',
  },
)

export type UserProfile = { id: string; name: string; slug: string }
export type FetchUserOutput = { profile: UserProfile }

export const syncCrmRecord = createActivity(
  async ({ profile }: FetchUserOutput): Promise<{ synced: boolean; recordSlug: string }> => {
    console.log(`[syncCrmRecord] synced record ${profile.id} (${profile.slug})`)
    return { synced: true, recordSlug: profile.slug }
  },
  {
    id: 'syncCrmRecord',
  },
)

export type ParallelResult = {
  sendWelcomeEmail: { sent: boolean; recipientSlug: string }
  syncCrmRecord: { synced: boolean; recordSlug: string }
}

export const logCompletion = createActivity(
  async (result: ParallelResult): Promise<void> => {
    console.log(
      `[logCompletion] email sent=${result.sendWelcomeEmail.sent} (slug=${result.sendWelcomeEmail.recipientSlug}), crm synced=${result.syncCrmRecord.synced}`,
    )
  },
  {
    id: 'logCompletion',
  },
)
export const startGreet = createActivity(async () => console.log('Hello '), { id: 'startGreet' })
export const endGreet = createActivity(async () => console.log('World'), { id: 'endGreet' })
