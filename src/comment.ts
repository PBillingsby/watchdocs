import * as github from '@actions/github'
import { AnalysisResult, AnalysisIssue } from './analyzer'

type Octokit = ReturnType<typeof github.getOctokit>

function buildCommentBody(analysis: AnalysisResult): string {
  const lines: string[] = []

  lines.push('## 👀 WatchDocs')
  lines.push('')
  lines.push(analysis.summary)
  lines.push('')
  lines.push('The following documentation files may need updating:')
  lines.push('')

  for (const issue of analysis.issues) {
    lines.push(`**\`${issue.file}\`**`)
    lines.push(`${issue.reason}`)
    lines.push('')
  }

  lines.push('---')
  lines.push('*Powered by [WatchDocs](https://github.com/pbillingsby/watchdocs-action)*')

  return lines.join('\n')
}

export async function postPRComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  analysis: AnalysisResult
): Promise<void> {
  const body: string = buildCommentBody(analysis)

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  })
}