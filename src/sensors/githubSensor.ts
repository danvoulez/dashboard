/**
 * GitHub Issues Sensor
 *
 * Monitors GitHub issues and pull requests:
 * - Assigned issues
 * - PR review requests
 * - Issue mentions
 * - Due dates
 */

import type { Span, Sensor } from '@/types'
import { SpanBuilder } from '@/utils/span'
import { db } from '@/utils/db'

export interface GitHubConfig {
  enabled: boolean
  accessToken?: string
  refreshIntervalMinutes: number
  repositories: string[] // e.g., ['owner/repo']
  filters: {
    assignedToMe: boolean
    mentionsMe: boolean
    reviewRequests: boolean
    labels: string[]
    states: ('open' | 'closed')[]
  }
  autoCreateTasks: boolean
}

const DEFAULT_CONFIG: GitHubConfig = {
  enabled: false,
  refreshIntervalMinutes: 30,
  repositories: [],
  filters: {
    assignedToMe: true,
    mentionsMe: true,
    reviewRequests: true,
    labels: [],
    states: ['open']
  },
  autoCreateTasks: true
}

export class GitHubSensor {
  private config: GitHubConfig
  private sensor: Sensor
  private pollingInterval: number | null = null
  private lastFetchTime: Date | null = null

  constructor(config: Partial<GitHubConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.sensor = {
      id: 'github_sensor',
      name: 'GitHub Issues & PRs',
      type: 'github',
      config: this.config,
      enabled: this.config.enabled
    }
  }

  /**
   * Start monitoring GitHub
   */
  async start(userId: string): Promise<void> {
    if (!this.config.enabled) {
      console.log('[GitHubSensor] Sensor is disabled')
      return
    }

    if (!this.config.accessToken) {
      console.error('[GitHubSensor] No access token provided')
      return
    }

    console.log('[GitHubSensor] Starting...')

    // Initial fetch
    await this.fetchIssues(userId)

    // Set up polling
    this.pollingInterval = window.setInterval(
      () => this.fetchIssues(userId),
      this.config.refreshIntervalMinutes * 60 * 1000
    )

    this.sensor.lastRun = new Date().toISOString()
    this.sensor.nextRun = new Date(
      Date.now() + this.config.refreshIntervalMinutes * 60 * 1000
    ).toISOString()
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
    console.log('[GitHubSensor] Stopped')
  }

  /**
   * Fetch issues from GitHub API
   */
  private async fetchIssues(userId: string): Promise<Span[]> {
    const spanBuilder = new SpanBuilder()
      .setName('github_sensor.fetch_issues')
      .setKind('client')
      .setUserId(userId)
      .setAttributes({
        sensorId: this.sensor.id,
        source: 'github',
        repositories: this.config.repositories
      })

    try {
      const spans: Span[] = []

      for (const repo of this.config.repositories) {
        const issues = await this.fetchRepoIssues(repo, userId)
        spans.push(...issues)
      }

      spanBuilder.addEvent('issues_fetched', {
        count: spans.length
      })

      // Save spans to DB
      for (const issueSpan of spans) {
        await db.spans.add(issueSpan)
      }

      spanBuilder.setStatus('ok')
      this.lastFetchTime = new Date()
      console.log(`[GitHubSensor] Processed ${spans.length} issues`)

      return spans
    } catch (error) {
      spanBuilder.setStatus('error')
      spanBuilder.addEvent('error', {
        error: error instanceof Error ? error.message : String(error)
      })
      console.error('[GitHubSensor] Error:', error)
      return []
    } finally {
      spanBuilder.end()
      await db.spans.add(spanBuilder.getSpan())
    }
  }

  /**
   * Fetch issues for a specific repository
   */
  private async fetchRepoIssues(repo: string, userId: string): Promise<Span[]> {
    // TODO: Implement actual GitHub API call
    // For now, simulate
    const issues = await this.simulateFetchIssues(repo)

    const spans: Span[] = []

    for (const issue of issues) {
      if (this.shouldProcessIssue(issue)) {
        const span = this.createIssueSpan(issue, userId)
        spans.push(span)
      }
    }

    return spans
  }

  /**
   * Create a span from GitHub issue
   */
  private createIssueSpan(issue: any, userId: string): Span {
    const isPR = !!issue.pull_request
    const tags: string[] = ['github', isPR ? 'pull_request' : 'issue']

    // Add label tags
    if (issue.labels) {
      tags.push(...issue.labels.map((l: any) => `label:${l.name}`))
    }

    // Check for urgent labels
    const urgentLabels = ['urgent', 'critical', 'high-priority', 'blocker']
    const isUrgent = issue.labels?.some((l: any) =>
      urgentLabels.some(ul => l.name.toLowerCase().includes(ul))
    )

    if (isUrgent) {
      tags.push('urgent', '🔥')
    }

    const span = new SpanBuilder()
      .setName(`github.${isPR ? 'pr' : 'issue'}_assigned`)
      .setKind('consumer')
      .setUserId(userId)
      .setAttributes({
        sensorId: this.sensor.id,
        source: 'github',
        createTask: true,
        issueId: issue.id,
        issueNumber: issue.number,
        repository: issue.repository,
        title: issue.title,
        url: issue.html_url,
        state: issue.state,
        labels: issue.labels?.map((l: any) => l.name) || [],
        assignee: issue.assignee?.login,
        author: issue.user?.login,
        isPR,
        deadline: this.extractDeadline(issue),
        critical: isUrgent
      })
      .build()

    span.attributes.tags = tags

    return span
  }

  /**
   * Check if issue should be processed
   */
  private shouldProcessIssue(issue: any): boolean {
    const { filters } = this.config

    // Check state filter
    if (!filters.states.includes(issue.state)) {
      return false
    }

    // Check label filter
    if (filters.labels.length > 0) {
      const issueLabels = issue.labels?.map((l: any) => l.name) || []
      const matches = filters.labels.some(label =>
        issueLabels.includes(label)
      )
      if (!matches) return false
    }

    // Additional filters (assignedToMe, mentionsMe, reviewRequests)
    // would require GitHub username - for now, accept all that passed above filters

    return true
  }

  /**
   * Extract deadline from issue
   */
  private extractDeadline(issue: any): string | undefined {
    // Check milestone due date
    if (issue.milestone?.due_on) {
      return issue.milestone.due_on
    }

    // Check for deadline in title or body
    const text = `${issue.title} ${issue.body || ''}`.toLowerCase()
    const patterns = [
      /deadline[:\s]+(\d{4}-\d{2}-\d{2})/i,
      /due[:\s]+(\d{4}-\d{2}-\d{2})/i,
      /by[:\s]+(\d{4}-\d{2}-\d{2})/i
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        try {
          return new Date(match[1]).toISOString()
        } catch {
          continue
        }
      }
    }

    return undefined
  }

  /**
   * Simulate issue fetching (for demo)
   */
  private async simulateFetchIssues(repo: string): Promise<any[]> {
    return [
      {
        id: 123,
        number: 42,
        repository: repo,
        title: 'Fix critical bug in authentication',
        body: 'Users are unable to login. Needs urgent fix by 2025-11-10',
        state: 'open',
        html_url: `https://github.com/${repo}/issues/42`,
        labels: [
          { name: 'bug' },
          { name: 'urgent' }
        ],
        assignee: { login: 'developer' },
        user: { login: 'reporter' },
        milestone: {
          due_on: '2025-11-10T00:00:00Z'
        },
        created_at: new Date().toISOString()
      },
      {
        id: 124,
        number: 43,
        repository: repo,
        title: 'Add new feature: dark mode',
        body: 'Implement dark mode for better UX',
        state: 'open',
        html_url: `https://github.com/${repo}/issues/43`,
        labels: [
          { name: 'enhancement' }
        ],
        assignee: { login: 'developer' },
        user: { login: 'product-manager' },
        pull_request: {},
        created_at: new Date().toISOString()
      }
    ]
  }

  /**
   * Get sensor status
   */
  getStatus() {
    return {
      ...this.sensor,
      isRunning: this.pollingInterval !== null,
      lastFetch: this.lastFetchTime?.toISOString()
    }
  }
}

/**
 * Create and start GitHub sensor
 */
export async function createGitHubSensor(
  config?: Partial<GitHubConfig>,
  userId?: string
): Promise<GitHubSensor> {
  const sensor = new GitHubSensor(config)

  if (userId && config?.enabled) {
    await sensor.start(userId)
  }

  return sensor
}
