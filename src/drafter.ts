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

Write ONLY the new missing sections. Do not repeat or reproduce any existing content. Do not add preamble or explanation. Start directly with the new section heading.

Match the exact tone, style, and format of the existing documentation.

## Existing Documentation (DO NOT REPEAT THIS)
${input.docFile.content}

## Missing Sections to Write
${input.gaps.join('\n')}

Write only the new sections now:`

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