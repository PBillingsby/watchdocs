import * as core from '@actions/core'

interface NotionPage {
  id: string
  title: string
  content: string
}

interface NotionRichText {
  plain_text?: string
}

interface NotionBlock {
  type?: string
  paragraph?: { rich_text?: NotionRichText[] }
  heading_1?: { rich_text?: NotionRichText[] }
  heading_2?: { rich_text?: NotionRichText[] }
  heading_3?: { rich_text?: NotionRichText[] }
  bulleted_list_item?: { rich_text?: NotionRichText[] }
  numbered_list_item?: { rich_text?: NotionRichText[] }
}

interface NotionPageResponse {
  properties?: {
    title?: {
      title?: NotionRichText[]
    }
  }
}

interface NotionBlocksResponse {
  results?: NotionBlock[]
}

function extractNotionPageIds(text: string): string[] {
  const regex: RegExp = /notion\.so\/[^\s]*([a-f0-9]{32})/g
  const matches: string[] = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1])
  }

  const unique: string[] = [...new Set(matches)]
  return unique
}

async function fetchPageTitle(
  pageId: string,
  token: string
): Promise<string> {
  const response: Response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
    },
  })

  if (!response.ok) {
    core.warning(`Failed to fetch Notion page ${pageId}: ${response.status}`)
    return 'Untitled'
  }

  const data: NotionPageResponse = await response.json() as NotionPageResponse
  const titleBlocks: NotionRichText[] = data.properties?.title?.title ?? []
  const title: string = titleBlocks[0]?.plain_text ?? 'Untitled'
  return title
}

async function fetchPageContent(
  pageId: string,
  token: string
): Promise<string> {
  const response: Response = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
    },
  })

  if (!response.ok) {
    return ''
  }

  const data: NotionBlocksResponse = await response.json() as NotionBlocksResponse
  const blocks: NotionBlock[] = data.results ?? []

  const lines: string[] = blocks.map((block: NotionBlock) => {
    const richTextBlock =
      block.paragraph ??
      block.heading_1 ??
      block.heading_2 ??
      block.heading_3 ??
      block.bulleted_list_item ??
      block.numbered_list_item

    const richTexts: NotionRichText[] = richTextBlock?.rich_text ?? []
    const line: string = richTexts.map((rt: NotionRichText) => rt.plain_text ?? '').join('')
    return line
  })

  const content: string = lines.filter(Boolean).join('\n').slice(0, 3000)
  return content
}

export async function fetchNotionPages(
  token: string,
  prDescription: string
): Promise<string> {
  const pageIds: string[] = extractNotionPageIds(prDescription)

  if (pageIds.length === 0) {
    core.info('No Notion page links found in PR description')
    return ''
  }
  core.info(`Found Notion pages: ${pageIds.join(', ')}`);
  const pages: NotionPage[] = []

  for (const id of pageIds) {
    const title: string = await fetchPageTitle(id, token)
    const content: string = await fetchPageContent(id, token)
    const page: NotionPage = { id, title, content }
    pages.push(page)
  }

  if (pages.length === 0) return ''

  const formatted: string = pages
    .map((p: NotionPage) => `Notion Page: ${p.title}\n${p.content}`)
    .join('\n\n')

  return formatted
}