import * as github from '@actions/github'
import * as core from '@actions/core'
import { AnalysisResult, AnalysisIssue } from './analyzer'

type Octokit = ReturnType<typeof github.getOctokit>

function buildCommentBody(
  analysis: AnalysisResult,
  owner: string,
  repo: string,
  sha: string
): string {
  const lines: string[] = []

  lines.push('## 👀 WatchDocs')
  lines.push('')
  lines.push(`**${analysis.summary}**`)
  lines.push('')

  const grouped: Record<string, AnalysisIssue[]> = {}

  for (const issue of analysis.issues) {
    if (!grouped[issue.file]) {
      grouped[issue.file] = []
    }
    grouped[issue.file].push(issue)
  }

  for (const [file, issues] of Object.entries(grouped)) {
    const fileUrl: string = `https://github.com/${owner}/${repo}/blob/${sha}/${file}`
    lines.push(`### 📄 [\`${file}\`](${fileUrl})`)
    lines.push('')
    for (const issue of issues) {
      lines.push(`- ⚠️ ${issue.reason}`)
    }
    lines.push('')
  }

  lines.push('---')
  lines.push('*Powered by [WatchDocs](https://github.com/PBillingsby/watchdocs)*')

  return lines.join('\n')
}

export async function findExistingComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<number | null> {
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
  })

  const existing = comments.find(
    (comment: { body?: string; id: number }) =>
      comment.body?.includes('## 👀 WatchDocs')
  )

  core.info(`Found existing comment ID: ${existing?.id ?? 'none'}`)
  return existing?.id ?? null
}

export async function postPRComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  sha: string,
  analysis: AnalysisResult
): Promise<void> {
  const body: string = buildCommentBody(analysis, owner, repo, sha)
  const existingCommentId: number | null = await findExistingComment(
    octokit,
    owner,
    repo,
    prNumber
  )

  if (existingCommentId !== null) {
    core.info('Updating existing WatchDocs comment')
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existingCommentId,
      body,
    })
  } else {
    core.info('Creating new WatchDocs comment')
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    })
  }
}

export async function resolveExistingComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  commentId: number
): Promise<void> {
  await octokit.rest.issues.updateComment({
    owner,
    repo,
    comment_id: commentId,
    body: '## 👀 WatchDocs\n\n✅ Documentation looks up to date. No gaps found.\n\n---\n*Powered by [WatchDocs](https://github.com/PBillingsby/watchdocs)*',
  })
}