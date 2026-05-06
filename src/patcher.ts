import * as github from '@actions/github'
import * as core from '@actions/core'
import { DraftResult } from './drafter'

type Octokit = ReturnType<typeof github.getOctokit>

export async function applyDraftAndOpenPR(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  prBranch: string,
  drafts: DraftResult[]
): Promise<void> {
  for (const draft of drafts) {
    const filePath: string = draft.filePath.replace(/^\//, '')

    const { data: fileData } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: prBranch,
    })

    const fileSha: string = Array.isArray(fileData) ? '' : fileData.sha
    const existingContent: string = Array.isArray(fileData)
      ? ''
      : Buffer.from((fileData as { content: string }).content, 'base64').toString('utf-8')

    const updated: string = `${existingContent}\n\n${draft.additions}`

    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: filePath,
      message: `docs: WatchDocs draft additions for PR #${prNumber}`,
      content: Buffer.from(updated).toString('base64'),
      sha: fileSha,
      branch: prBranch,
    })

    core.info(`Committed draft additions to ${filePath} on ${prBranch}`)
  }
}