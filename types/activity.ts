export interface ActivitySummary {
  what_changed: string
  why_it_changed: string
  pr_title: string
  pr_description: string
  commit_count: number
  notable_commits: string[]
}
