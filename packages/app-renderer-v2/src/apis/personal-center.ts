import { apiRequest, type ApiAuth } from './internal/client'

export type Experience = {
  experience: number
  level: number
  nextLevelExperience: number | null
  experienceToNextLevel: number
  date: string
  timezone: 'Asia/Shanghai'
  checkedIn: boolean
  awardedExperience: number
  nextCheckInAt: string
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid response')
  return value as Record<string, unknown>
}
const nonnegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
function experience(value: unknown): Experience {
  const data = object(value)
  if (
    !nonnegative(data.experience) ||
    !nonnegative(data.level) ||
    data.level > 3 ||
    !(data.nextLevelExperience === null || nonnegative(data.nextLevelExperience)) ||
    !nonnegative(data.experienceToNextLevel) ||
    !nonnegative(data.awardedExperience) ||
    typeof data.checkedIn !== 'boolean' ||
    data.timezone !== 'Asia/Shanghai' ||
    typeof data.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(data.date) ||
    !Number.isFinite(Date.parse(`${data.date}T00:00:00Z`)) ||
    new Date(`${data.date}T00:00:00Z`).toISOString().slice(0, 10) !== data.date ||
    typeof data.nextCheckInAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T16:00:00(?:\.000)?Z$/.test(data.nextCheckInAt) ||
    Date.parse(data.nextCheckInAt) !== Date.parse(`${data.date}T16:00:00Z`)
  )
    throw new Error('Invalid experience')
  const level =
    data.experience >= 2000 ? 3 : data.experience >= 600 ? 2 : data.experience >= 100 ? 1 : 0
  const next = [100, 600, 2000, null][level]!
  if (
    data.level !== level ||
    data.nextLevelExperience !== next ||
    data.experienceToNextLevel !== (next === null ? 0 : next - data.experience) ||
    ![0, 10].includes(data.awardedExperience) ||
    (!data.checkedIn && data.awardedExperience !== 0)
  )
    throw new Error('Invalid experience')
  return {
    experience: data.experience,
    level: data.level,
    nextLevelExperience: data.nextLevelExperience,
    experienceToNextLevel: data.experienceToNextLevel,
    date: data.date,
    timezone: data.timezone,
    checkedIn: data.checkedIn,
    awardedExperience: data.awardedExperience,
    nextCheckInAt: data.nextCheckInAt,
  }
}
export const apiUserExperience = (auth: ApiAuth) =>
  apiRequest('/users/me/experience', experience, auth)
export const apiUserCheckIn = (auth: ApiAuth) =>
  apiRequest('/users/me/check-in', experience, auth, 'POST', {})
export const apiUserNickname = (auth: ApiAuth, nickname: string) =>
  apiRequest(
    '/users/me/nickname',
    (value): { nickname: string } => {
      const data = object(value)
      if (typeof data.nickname !== 'string' || !data.nickname.length)
        throw new Error('Invalid nickname')
      return { nickname: data.nickname }
    },
    auth,
    'PATCH',
    { nickname },
  )
