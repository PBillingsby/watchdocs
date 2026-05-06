import * as core from '@actions/core'
import * as github from '@actions/github'
import { fetchPRDiff } from './sources/github'
import { fetchJiraTickets } from './sources/jira'
import { fetchNotionPages } from './sources/notion'
import { analyzeWithClaude, scoreDocRelevance } from './analyzer'
import { postPRComment, findExistingComment, resolveExistingComment } from './comment'
import { loadConfig } from './config'
import * as fs from 'fs'
import * as path from 'path'

async function run() {
  try {
    const config = loadConfig('watchdocs.config.yml')
    const anthropicKey = core.getInput('anthropic_api_key', { required: true })
    const githubToken = core.getInput('github_token', { required: true })
    const octokit = github.getOctokit(githubToken)
    const context = github.context

    if (!context.payload.pull_request) {
      core.info('No pull request found, skipping WatchDocs')
      return
    }

    const prNumber = context.payload.pull_request.number
    const owner = context.repo.owner
    const repo = context.repo.repo

    core.info('Fetching PR diff...')
    const prDiff = await fetchPRDiff(octokit, owner, repo, prNumber, anthropicKey)

    // fetch changelog if enabled
    let changelog = ''
    if (config.sources.changelog) {
      const changelogPath = path.join(process.cwd(), 'CHANGELOG.md')
      if (fs.existsSync(changelogPath)) {
        changelog = fs.readFileSync(changelogPath, 'utf-8').slice(0, 3000)
        core.info('Changelog found and loaded')
      } else {
        core.info('No CHANGELOG.md found, skipping')
      }
    }

    // fetch jira tickets if enabled
    let jiraContext = ''
    if (config.sources.jira) {
      core.info('Fetching Jira tickets...')
      const jiraUrl = core.getInput('jira_url')
      const jiraToken = core.getInput('jira_token')
      const jiraEmail = core.getInput('jira_email')
      if (jiraUrl && jiraToken && jiraEmail) {
        jiraContext = await fetchJiraTickets(
          prDiff.description,
          jiraUrl,
          jiraEmail,
          jiraToken
        )
      } else {
        core.warning('Jira enabled in config but credentials not provided, skipping')
      }
    }

    // fetch notion pages if enabled
    let notionContext = ''
    if (config.sources.notion) {
      core.info('Fetching Notion pages...')
      const notionToken = core.getInput('notion_token')
      if (notionToken) {
        notionContext = await fetchNotionPages(notionToken, prDiff.description)
      } else {
        core.warning('Notion enabled in config but token not provided, skipping')
      }
    }

    // load doc files from configured paths
    core.info('Loading documentation files...')
    const allDocFiles: { path: string; content: string }[] = loadDocFiles(config.docs.paths)

    if (allDocFiles.length === 0) {
      core.warning('No documentation files found in configured paths, skipping')
      return
    }

    core.info(`Found ${allDocFiles.length} documentation files`)

    // score doc files for relevance against changed files
    const relevantDocPaths: string[] = await scoreDocRelevance(
      anthropicKey,
      prDiff.diff.split('\n')
        .filter((line: string) => line.startsWith('File:'))
        .map((line: string) => line.replace('File: ', '').trim()),
      allDocFiles
    )

    // only load full content for relevant doc files
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

    core.info(`Found ${docFiles.length} documentation files`)

    core.info(`Doc files being sent to Claude: ${docFiles.map(f => `${f.path} (${f.content.length} chars)`).join(', ')}`)
    
    // run claude analysis
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
    
      // clean up existing comment if docs are now up to date
      const existingCommentId: number | null = await findExistingComment(
        octokit,
        owner,
        repo,
        prNumber
      )
    
      if (existingCommentId !== null) {
        core.info('Docs are up to date, resolving existing WatchDocs comment')
        await resolveExistingComment(octokit, owner, repo, existingCommentId)
      }
    
      return
    }

    // post PR comment
    core.info('Posting PR comment...')
    const sha: string = context.payload.pull_request.head.sha
    await postPRComment(octokit, owner, repo, prNumber, sha, analysis)

    core.info('WatchDocs complete')
  } catch (error) {
    core.setFailed(`WatchDocs failed: ${error}`)
  }
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

run()