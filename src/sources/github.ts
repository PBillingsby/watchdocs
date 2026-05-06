import * as github from '@actions/github'
import * as core from '@actions/core'
import Anthropic from '@anthropic-ai/sdk'

export interface PRData {
  diff: string
  description: string
  title: string
}

type Octokit = ReturnType<typeof github.getOctokit>

interface PRFile {
  filename: string
  status: string
  patch?: string
}

async function scoreFileRelevance(
  files: PRFile[],
  anthropicKey: string
): Promise<string[]> {
  const client: Anthropic = new Anthropic({ apiKey: anthropicKey })

  const filenames: string[] = files.map((f: PRFile) => f.filename)

  const prompt: string = `You are analyzing a pull request. Given this list of changed files, identify which ones are likely user-facing or developer-facing based on their names and paths.

User-facing means: public APIs, SDK methods, request handlers, route definitions, exported functions, or anything a developer integrating with this product would interact with.

Not user-facing means: tests, internal utilities, config files, build artifacts, lock files, CI/CD configs, or internal helpers.

Files:
${filenames.join('\n')}

Respond ONLY with a JSON array of the filenames that are user-facing. No preamble, no explanation:
["path/to/file.ts", "path/to/other.py"]`

  const response: Anthropic.Message = await client.messages.create({
    model: 'claude-haiku-4-5',
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
    core.warning('File relevance scoring returned no text, using all files')
    return filenames
  }

  const raw: string = firstBlock.text.replace(/```json|```/g, '').trim()

  const relevant: string[] = JSON.parse(raw) as string[]
  core.info(`Relevant files identified: ${relevant.join(', ')}`)
  return relevant
}

export async function fetchPRDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  anthropicKey: string
): Promise<PRData> {
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  })

  const { data: files } = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
  })

  const nonDocFiles: PRFile[] = files.filter(
    (f: PRFile) => !f.filename.startsWith('docs/')
  )

  core.info(`Total changed files: ${nonDocFiles.length}`)

  // step 1 -- score files by relevance using cheap haiku call
  const relevantFilenames: string[] = await scoreFileRelevance(
    nonDocFiles,
    anthropicKey
  )

  // step 2 -- only fetch full diff for relevant files
  const relevantFiles: PRFile[] = nonDocFiles.filter((f: PRFile) =>
    relevantFilenames.includes(f.filename)
  )

  core.info(`User-facing files after scoring: ${relevantFiles.length}`)

  const diffParts: string[] = []

  for (const file of relevantFiles) {
    const patch: string = file.patch ?? ''
    const part: string = `File: ${file.filename}\nStatus: ${file.status}\n${patch}`
    diffParts.push(part)
  }

  const diff: string = diffParts.join('\n\n').slice(0, 6000)

  return {
    diff,
    description: pr.body ?? '',
    title: pr.title,
  }
}