import * as core from '@actions/core'
import * as github from '@actions/github'
import { fetchPRDiff } from './sources/github'
import { fetchJiraTickets } from './sources/jira'
import { fetchNotionPages } from './sources/notion'
import { analyzeWithClaude, scoreDocRelevance } from './analyzer'
import { postPRComment, findExistingComment, resolveExistingComment } from './comment'
import { generateDraft } from './drafter'
import { applyDraftAndOpenPR } from './patcher'
import { loadConfig } from './config'
import * as fs from 'fs'
import * as path from 'path'

async function runAnalysisMode(): Promise<void> {
  try {
    const mode: string = core.getInput('mode') || 'analyze'

    if (mode === 'draft') {
      await runDraftMode()
    } else {
      await runAnalysisMode()
    }
  } catch (error) {
    core.setFailed(`WatchDocs failed: ${error}`)
  }
}

async function runDraftMode(): Promise<void> {
  const anthropicKey: string = core.getInput('anthropic_api_key', { required: true })
  const githubToken: string = core.getInput('github_token', { required: true })
  const octokit = github.getOctokit(githubToken)
  const context = github.context

  // get PR number from the issue comment event
  const prNumber: number = context.payload.issue?.number
  if (!prNumber) {
    core.info('No PR number found, skipping draft mode')
    return
  }

  const owner: string = context.repo.owner
  const repo: string = context.repo.repo

  core.info(`Running WatchDocs draft mode for PR #${prNumber}`)

  // get the PR branch
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  })

  const prBranch: string = pr.head.ref

  // find and parse the existing WatchDocs comment
  const existingCommentId: number | null = await findExistingComment(
    octokit,
    owner,
    repo,
    prNumber
  )

  if (!existingCommentId) {
    core.info('No WatchDocs comment found -- run analysis first')
    return
  }

  const { data: comment } = await octokit.rest.issues.getComment({
    owner,
    repo,
    comment_id: existingCommentId,
  })

  // extract gaps from the comment body
  const gaps: string[] = extractGapsFromComment(comment.body ?? '')

  if (gaps.length === 0) {
    core.info('No gaps found in WatchDocs comment, skipping draft')
    return
  }

  core.info(`Found ${gaps.length} gaps to draft`)

  // load doc files
  const config = loadConfig('watchdocs.config.yml')
  const allDocFiles: { path: string; content: string }[] = loadDocFiles(config.docs.paths)

  // generate drafts for each doc file that has gaps
  const drafts = []
  for (const docFile of allDocFiles) {
    const fileGaps: string[] = gaps.filter(g => g.includes(docFile.path))
    if (fileGaps.length === 0) continue

    const draft = await generateDraft({
      anthropicKey,
      gaps: fileGaps,
      docFile,
    })

    drafts.push(draft)
  }

  if (drafts.length === 0) {
    core.info('No drafts generated')
    return
  }

  // open PR with draft additions
  await applyDraftAndOpenPR(octokit, owner, repo, prNumber, prBranch, drafts)

  // post comment on original PR letting dev know
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: '## 👀 WatchDocs\n\n✍️ Draft documentation additions have been generated. Check the new PR for review.',
  })

  core.info('WatchDocs draft mode complete')
}

function extractGapsFromComment(body: string): string[] {
  const lines: string[] = body.split('\n')
  const gaps: string[] = lines
    .filter((line: string) => line.includes('⚠️'))
    .map((line: string) => line.replace('- ⚠️', '').trim())
  return gaps
}

function loadDocFiles(paths: string[]): { path: string; content: string }[] {
  const docFiles: { path: string; content: string }[] = []

  for (const docPath of paths) {
    const fullPath: string = path.join(process.cwd(), docPath)
    if (!fs.existsSync(fullPath)) continue

    const files: string[] = getAllMarkdownFiles(fullPath)
    for (const file of files) {
      const content: string = fs.readFileSync(file, 'utf-8')
      docFiles.push({
        path: file.replace(process.cwd(), ''),
        content,
      })
    }
  }

  return docFiles
}

function getAllMarkdownFiles(dir: string): string[] {
  const results: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...getAllMarkdownFiles(fullPath))
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
      results.push(fullPath)
    }
  }

  return results
}

runAnalysisMode()