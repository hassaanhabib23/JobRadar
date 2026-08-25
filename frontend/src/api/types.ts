/**
 * Domain types.
 *
 * `schema.d.ts` is generated from the committed OpenAPI contract and checked in
 * CI for drift, which is what catches the backend and frontend disagreeing. It
 * is not, however, precise enough to build a UI on: jsonb columns come through
 * as `{}` and every read-only field is optional, so the score breakdown — the
 * most-used object in the app — would be untyped.
 *
 * So the generated file guards the contract, and these interfaces describe the
 * shapes the UI actually reads. `assertContractCompatible` below keeps the two
 * from drifting apart silently.
 */

import type { components } from './schema'

type Schemas = components['schemas']

export type ApplicationStatus = Schemas['ApplicationStatusEnum']
export type RunStatus = Schemas['RunStatusEnum']

/** The score breakdown. Every job carries one; a score with no reason is useless. */
export interface ScoreDetail {
  stack: number
  level: number
  location: number
  fresh: number
  skillsHit: string[]
  notes: string[]
  ageDays: number | null
  ageInferred: boolean
}

export interface Job {
  id: number
  key: string
  source: string
  company: string
  title: string
  location: string
  url: string
  description: string
  postedAt: string | null
  firstSeen: string
  lastSeen: string
  closedAt: string | null
  seenCount: number
  score: number
  tier: string
  status: ApplicationStatus
  notes: string
  pinned: boolean
  remindAt: string | null
  isNew: boolean
  flags: string[]
  detail: ScoreDetail | null
  alsoSeenOn: string[]
  dateFrom: string
  trackingDays: number
}

export interface User {
  id: number
  email: string
  onboardingComplete: boolean
  /** Soft gate: false only withholds the digest, never access to the app. */
  emailVerified: boolean
  dateJoined: string
}

export interface Location {
  key: string
  label: string
  aliases: string[]
}

export interface Freshness {
  maxAgeDays: number
  unknownDatePoints: number
  ghostPoints: number
  dropUnknownDate: boolean
  ghostAfterDaysTracked: number
}

export interface Profile {
  skills: Record<string, number>
  levelBonus: Record<string, number>
  levelPenalty: Record<string, number>
  titleBlocklist: string[]
  locationsAllowed: string[]
  locationsPreferred: string[]
  locationsSecondary: string[]
  stackSaturation: number
  freshness: Partial<Freshness>
  roleKeywords: string[]
  updatedAt: string
}

export interface RunSourceResult {
  id: number
  label: string
  kind: string
  ok: boolean
  postings: number
  error: string
  durationMs: number
}

export interface Run {
  id: number
  startedAt: string
  finishedAt: string | null
  status: RunStatus
  triggeredBy: string
  sourcesTotal: number
  sourcesFailed: number
  postingsFetched: number
  jobsCreated: number
  jobsUpdated: number
  jobsClosed: number
  usersScored: number
  error: string
  durationSeconds: number | null
  succeeded: boolean
}

export interface RunDetail extends Run {
  sourceResults: RunSourceResult[]
}

export interface Stats {
  openCount: number
  newToday: number
  byTier: Record<string, number>
  bySource: Record<string, number>
  byStatus: Record<string, number>
  avgScore: number | null
  lastRunAt: string | null
  scoreHistogram: { bucket: string; min: number; count: number }[]
}

export interface Source {
  id: number
  kind: string
  slug: string
  company: string
  host: string
  tenant: string
  site: string
  url: string
  label: string
  locationHint: string
  config: Record<string, unknown>
  enabled: boolean
  lastRunAt: string | null
  lastStatus: string
  lastError: string
  isShared: boolean
  isMine: boolean
}

/** The DRF pagination envelope. The frontend expects this shape everywhere. */
export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface AuthResponse {
  user: User
  access: string
}

export interface StatusChoice {
  value: ApplicationStatus
  label: string
}

export interface StatusEvent {
  fromStatus: ApplicationStatus | ''
  toStatus: ApplicationStatus
  changedAt: string
}

export type Seniority = 'junior' | 'mid' | 'senior' | 'lead' | 'unknown'

export interface ResumeSignals {
  detectedSkills: Record<string, number>
  detectedRoleKeywords: string[]
  detectedSeniority: Seniority
  uploadedAt: string
  parsedAt: string | null
}

export interface ScorePreview {
  score: number | null
  tier: string | null
  detail: ScoreDetail | null
  flags: string[]
  filtered: boolean
  filteredReason: string | null
}

export const TIERS = ['High', 'Medium', 'Stretch'] as const
export type Tier = (typeof TIERS)[number]

/** Onboarding role chips — the values the backend accepts in `roleKeywords`. */
export const ROLE_KEYWORDS = [
  { value: 'dotnet', label: '.NET' },
  { value: 'react', label: 'React' },
  { value: 'angular', label: 'Angular' },
  { value: 'python', label: 'Python' },
  { value: 'qa', label: 'QA' },
  { value: 'devops', label: 'DevOps' },
  { value: 'ai_ml', label: 'AI / ML' },
] as const

/**
 * A compile-time link back to the generated schema.
 *
 * If the backend renames a field, the generated type changes and these
 * assignments stop compiling — so the hand-written interfaces above cannot
 * quietly describe an API that no longer exists.
 */
type AssertAssignable<Generated, Local extends Generated> = Local
export type _JobMatchesContract = AssertAssignable<
  Pick<Schemas['Job'], 'id' | 'key' | 'company' | 'title' | 'score' | 'tier'>,
  Pick<Job, 'id' | 'key' | 'company' | 'title' | 'score' | 'tier'>
>
export type _RunMatchesContract = AssertAssignable<
  Pick<Schemas['Run'], 'id' | 'status'>,
  Pick<Run, 'id' | 'status'>
>
