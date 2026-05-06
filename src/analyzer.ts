import Anthropic from '@anthropic-ai/sdk'
import * as core from '@actions/core'

export interface DocFile {
  path: string
  content: string
}

export interface AnalysisInput {
  anthropicKey: string
  prDiff: string
  prDescription: string
  changelog: string
  jiraContext: string
  notionContext: string
  docFiles: DocFile[]
}

export interface AnalysisIssue {
  file: string
  reason: string
}

export interface AnalysisResult {
  hasIssues: boolean
  issues: AnalysisIssue[]
  summary: string
}

const MAX_RETRIES: number = 3
const RETRY_DELAY_MS: number = 2000
const MAX_DIFF_TOKENS: number = 4000

function truncateToTokenBudget(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  core.warning(`Content truncated from ${text.length} to ${maxChars} chars to stay within context budget`)
  return text.slice(0, maxChars) + '\n... [truncated]'
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function callClaudeWithRetry(
  client: Anthropic,
  prompt: string,
  attempt: number = 1
): Promise<string> {
  try {
    const response: Anthropic.Message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    const firstBlock: Anthropic.ContentBlock = response.content[0]

    if (firstBlock.type !== 'text') {
      throw new Error('Claude returned no text content')
    }

    return firstBlock.text

  } catch (error) {
    const isRetryable: boolean =
      error instanceof Anthropic.APIError &&
      error.status !== undefined &&
        (error.status === 429 || error.status >= 500)

    if (isRetryable && attempt < MAX_RETRIES) {
      const delay: number = RETRY_DELAY_MS * attempt
      core.warning(`Claude API error on attempt ${attempt}, retrying in ${delay}ms: ${error}`)
      await sleep(delay)
      return callClaudeWithRetry(client, prompt, attempt + 1)
    }

    throw error
  }
}

function parseAnalysisResult(raw: string): AnalysisResult {
  const cleaned: string = raw.replace(/```json|```/g, '').trim()

  try {
    const parsed: AnalysisResult = JSON.parse(cleaned) as AnalysisResult

    if (typeof parsed.hasIssues !== 'boolean') {
      throw new Error('Missing hasIssues field')
    }
    if (!Array.isArray(parsed.issues)) {
      throw new Error('Missing issues array')
    }
    if (typeof parsed.summary !== 'string') {
      throw new Error('Missing summary field')
    }

    return parsed
  } catch (error) {
    core.warning(`Failed to parse Claude response as JSON: ${error}`)
    core.warning(`Raw response: ${cleaned.slice(0, 500)}`)
    return {
      hasIssues: false,
      issues: [],
      summary: 'WatchDocs was unable to parse the analysis result. Please check the action logs.',
    }
  }
}

export async function analyzeWithClaude(input: AnalysisInput): Promise<AnalysisResult> {
  const client: Anthropic = new Anthropic({ apiKey: input.anthropicKey })

  const docContext: string = truncateToTokenBudget(
    input.docFiles
      .map((f: DocFile) => `### ${f.path}\n${f.content}`)
      .join('\n\n'),
      MAX_DIFF_TOKENS
  )

  const diffContext: string = truncateToTokenBudget(
    input.prDiff,
    MAX_DIFF_TOKENS
  )

  const sourceContext: string = [
    diffContext ? `## PR Diff\n${diffContext}` : '',
    input.prDescription ? `## PR Description\n${input.prDescription}` : '',
    input.changelog ? `## Changelog\n${input.changelog}` : '',
    input.jiraContext ? `## Jira Tickets\n${input.jiraContext}` : '',
    input.notionContext ? `## Notion Pages\n${input.notionContext}` : '',
  ].filter(Boolean).join('\n\n')

  const prompt: string = `You are WatchDocs, a documentation gap detector. Your job is to identify documentation that is missing or outdated based on code changes.

## Current Documentation
${docContext}

## Changes Being Made
${sourceContext}

## Instructions
Analyze the changes and identify any documentation gaps. A gap exists when:
- A new endpoint, function, parameter, or feature is introduced but not documented
- An existing behavior changes but the docs still describe the old behavior
- A new error code or response is added but not listed in the docs
- A changelog entry references something that does not appear in the docs

Only flag user-facing or developer-facing changes. Ignore internal refactors, config changes, test updates, and infrastructure changes that do not affect the public API or developer experience.

Be specific. Reference the exact file, the missing item, and why it needs updating.
If there are no documentation gaps, say so clearly.

Respond ONLY with a JSON object in this exact format, no preamble:
{
  "hasIssues": true,
  "summary": "brief one sentence summary",
  "issues": [
    {
      "file": "path to the doc file that needs updating",
      "reason": "specific explanation of what is missing or outdated"
    }
  ]
}`

  core.info('Sending analysis request to Claude...')

  const raw: string = await callClaudeWithRetry(client, prompt)
  const result: AnalysisResult = parseAnalysisResult(raw)

  core.info(`Analysis complete. Has issues: ${result.hasIssues}, Issue count: ${result.issues.length}`)

  return result
}

export async function scoreDocRelevance(
  anthropicKey: string,
  changedFiles: string[],
  docFiles: { path: string }[]
): Promise<string[]> {
  const client: Anthropic = new Anthropic({ apiKey: anthropicKey })

  const prompt: string = `You are analyzing a pull request. Given these changed code files and available documentation files, identify which documentation files are likely affected by the code changes.

Changed code files:
${changedFiles.join('\n')}

Available documentation files:
${docFiles.map(f => f.path).join('\n')}

Respond ONLY with a JSON array of the documentation file paths that are likely affected. No preamble, no explanation:
["path/to/doc.md"]`

  const response: Anthropic.Message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  const firstBlock: Anthropic.ContentBlock = response.content[0]

  if (firstBlock.type !== 'text') {
    core.warning('Doc relevance scoring returned no text, using all doc files')
    return docFiles.map(f => f.path)
  }

  const raw: string = firstBlock.text.replace(/```json|```/g, '').trim()

  try {
    const relevant: string[] = JSON.parse(raw) as string[]
    core.info(`Relevant doc files identified: ${relevant.join(', ')}`)
    return relevant
  } catch {
    core.warning('Failed to parse doc relevance response, using all doc files')
    return docFiles.map(f => f.path)
  }
}