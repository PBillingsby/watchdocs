import * as github from '@actions/github'
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

export async function postPRComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  sha: string,
  analysis: AnalysisResult
): Promise<void> {
  const body: string = buildCommentBody(analysis, owner, repo, sha)

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  })
}