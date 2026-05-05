import * as github from '@actions/github'

export interface PRData {
  diff: string
  description: string
  title: string
}

type Octokit = ReturnType<typeof github.getOctokit>

export async function fetchPRDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
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

  const diffParts: string[] = []

  for (const file of files) {
    if (file.filename.startsWith('docs/')) continue

    const patch: string = file.patch ?? ''
    const part = `File: ${file.filename}\nStatus: ${file.status}\n${patch}`
    diffParts.push(part)
  }

  const diff: string = diffParts.join('\n\n').slice(0, 6000)

  return {
    diff,
    description: pr.body ?? '',
    title: pr.title,
  }
}