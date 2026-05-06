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

async function run(): Promise<void> {
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

async function runAnalysisMode(): Promise<void> {
  const config = loadConfig('watchdocs.config.yml')
  const anthropicKey: string = core.getInput('anthropic_api_key', { required: true })
  const githubToken: string = core.getInput('github_token', { required: true })
  const octokit = github.getOctokit(githubToken)
  const context = github.context

  if (!context.payload.pull_request) {
    core.info('No pull request found, skipping WatchDocs')
    return
  }

  const prNumber: number = context.payload.pull_request.number
  const owner: string = context.repo.owner
  const repo: string = context.repo.repo

  core.info('Fetching PR diff...')
  const prDiff = await fetchPRDiff(octokit, owner, repo, prNumber, anthropicKey)

  let changelog: string = ''
  if (config.sources.changelog) {
    const changelogPath: string = path.join(process.cwd(), 'CHANGELOG.md')
    if (fs.existsSync(changelogPath)) {
      changelog = fs.readFileSync(changelogPath, 'utf-8').slice(0, 3000)
      core.info('Changelog found and loaded')
    } else {
      core.info('No CHANGELOG.md found, skipping')
    }
  }

  let jiraContext: string = ''
  if (config.sources.jira) {
    core.info('Fetching Jira tickets...')
    const jiraUrl: string = core.getInput('jira_url')
    const jiraToken: string = core.getInput('jira_token')
    const jiraEmail: string = core.getInput('jira_email')
    if (jiraUrl && jiraToken && jiraEmail) {
      jiraContext = await fetchJiraTickets(prDiff.description, jiraUrl, jiraEmail, jiraToken)
    } else {
      core.warning('Jira enabled in config but credentials not provided, skipping')
    }
  }

  let notionContext: string = ''
  if (config.sources.notion) {
    core.info('Fetching Notion pages...')
    const notionToken: string = core.getInput('notion_token')
    if (notionToken) {
      notionContext = await fetchNotionPages(notionToken, prDiff.description)
    } else {
      core.warning('Notion enabled in config but token not provided, skipping')
    }
  }

  core.info('Loading documentation files...')
  const allDocFiles: { path: string; content: string }[] = loadDocFiles(config.docs.paths)

  if (allDocFiles.length === 0) {
    core.warning('No documentation files found in configured paths, skipping')
    return
  }

  core.info(`Found ${allDocFiles.length} documentation files`)

  const relevantDocPaths: string[] = await scoreDocRelevance(
    anthropicKey,
    prDiff.diff.split('\n')
      .filter((line: string) => line.startsWith('File:'))
      .map((line: string) => line.replace('File: ', '').trim()),
    allDocFiles
  )

  const docFiles: { path: string; content: string }[] = allDocFiles.filter(
    (f: { path: string; content: string }) => relevantDocPaths.some(
      (p: string) => f.path.includes(p) || p.includes(f.path)
    )
  )

  core.info(`Relevant doc files after scoring: ${docFiles.length}`)

  if (docFiles.length === 0) {
    core.warning('No relevant doc files found for this PR, skipping')
    return
  }

  core.info(`Doc files being sent to Claude: ${docFiles.map((f: { path: string; content: string }) => `${f.path} (${f.content.length} chars)`).join(', ')}`)

  core.info('Analyzing with Claude...')
  const analysis = await analyzeWithClaude({
    anthropicKey,
    prDiff: prDiff.diff,
    prDescription: prDiff.description,
    changelog,
    jiraContext,
    notionContext,
    docFiles,
  })

  if (!analysis.hasIssues) {
    core.info('WatchDocs: No documentation gaps found')
    const existingCommentId: number | null = await findExistingComment(octokit, owner, repo, prNumber)
    if (existingCommentId !== null) {
      core.info('Docs are up to date, resolving existing WatchDocs comment')
      await resolveExistingComment(octokit, owner, repo, existingCommentId)
    }
    return
  }

  core.info('Posting PR comment...')
  const sha: string = context.payload.pull_request.head.sha
  await postPRComment(octokit, owner, repo, prNumber, sha, analysis)
  core.info('WatchDocs complete')
}

async function runDraftMode(): Promise<void> {
  const anthropicKey: string = core.getInput('anthropic_api_key', { required: true })
  const githubToken: string = core.getInput('github_token', { required: true })
  const octokit = github.getOctokit(githubToken)
  const context = github.context

  const prNumber: number | undefined = context.payload.issue?.number
  if (!prNumber) {
    core.info('No PR number found, skipping draft mode')
    return
  }

  const owner: string = context.repo.owner
  const repo: string = context.repo.repo

  core.info(`Running WatchDocs draft mode for PR #${prNumber}`)

  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  })

  const prBranch: string = pr.head.ref

  const existingCommentId: number | null = await findExistingComment(
    octokit,
    owner,
    repo,
    prNumber
  )

  if (!existingCommentId) {
    core.info('No WatchDocs comment found, run analysis first')
    return
  }

  const { data: comment } = await octokit.rest.issues.getComment({
    owner,
    repo,
    comment_id: existingCommentId,
  })

  const gaps: string[] = extractGapsFromComment(comment.body ?? '')

  if (gaps.length === 0) {
    core.info('No gaps found in WatchDocs comment, skipping draft')
    return
  }

  core.info(`Found ${gaps.length} gaps to draft`)

  const config = loadConfig('watchdocs.config.yml')
  const allDocFiles: { path: string; content: string }[] = loadDocFiles(config.docs.paths)

  const drafts: { filePath: string; additions: string }[] = []

  for (const docFile of allDocFiles) {
    if (gaps.length === 0) continue
  
    const draft = await generateDraft({
      anthropicKey,
      gaps,
      docFile,
    })
  
    drafts.push(draft)
  }

  if (drafts.length === 0) {
    core.info('No drafts generated')
    return
  }

  await applyDraftAndOpenPR(octokit, owner, repo, prNumber, prBranch, drafts)

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
    const fullPath: string = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...getAllMarkdownFiles(fullPath))
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
      results.push(fullPath)
    }
  }

  return results
}

run()