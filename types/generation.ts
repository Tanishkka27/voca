import type { ActivitySummary } from './activity'

export interface DraftSuccess {
  style: 'raw' | 'polished' | 'short'
  content: string
  success: true
}

export interface DraftError {
  style: 'raw' | 'polished' | 'short'
  error: string
  success: false
}

export interface GenerationResult {
  drafts: DraftSuccess[]
  errors: DraftError[]
  generatedAt: string
  activitySummary: ActivitySummary
}