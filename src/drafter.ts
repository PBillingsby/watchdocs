import Anthropic from '@anthropic-ai/sdk'
import * as core from '@actions/core'

export interface DraftInput {
  anthropicKey: string
  gaps: string[]
  docFile: { path: string; content: string }
}

export interface DraftResult {
  filePath: string
  additions: string
}

export async function generateDraft(input: DraftInput): Promise<DraftResult> {
  const client: Anthropic = new Anthropic({ apiKey: input.anthropicKey })

  const prompt: string = `You are a technical writer. You will be given an existing documentation file and a list of missing sections that need to be added.

Your job is to write ONLY the missing sections in the exact same tone, style, and format as the existing documentation. Do not rewrite existing content. Do not add preamble or explanation. Just write the new sections ready to be appended to the doc file.

## Existing Documentation
${input.docFile.content}

## Missing Sections to Write
${input.gaps.join('\n')}

Write the new documentation sections now. Match the existing format exactly.`

  const response: Anthropic.Message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
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

  core.info(`Draft generated for ${input.docFile.path}`)

  return {
    filePath: input.docFile.path,
    additions: firstBlock.text,
  }
}