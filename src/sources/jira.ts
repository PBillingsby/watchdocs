import * as core from '@actions/core'

interface JiraTicket {
  id: string
  summary: string
  description: string
  status: string
}

interface JiraIssueResponse {
  key: string
  fields: {
    summary: string
    status: { name: string }
    description?: {
      content?: Array<{
        content?: Array<{ text?: string }>
      }>
    }
  }
}

function extractJiraTicketIds(text: string): string[] {
  const regex: RegExp = /\b([A-Z][A-Z0-9]+-\d+)\b/g
  const matches: string[] | null = text.match(regex)
  const unique: string[] = [...new Set(matches ?? [])]
  return unique
}

async function fetchTicket(
  ticketId: string,
  jiraUrl: string,
  email: string,
  token: string
): Promise<JiraTicket | null> {
  const credentials: string = Buffer.from(`${email}:${token}`).toString('base64')
  const url: string = `${jiraUrl}/rest/api/3/issue/${ticketId}`

  const response: Response = await fetch(url, {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    core.warning(`Failed to fetch Jira ticket ${ticketId}: ${response.status}`)
    return null
  }

  const data: JiraIssueResponse = await response.json() as JiraIssueResponse

  const descriptionBlocks: Array<{ content?: Array<{ text?: string }> }> = data.fields.description?.content ?? []
  const descriptionText: string = descriptionBlocks
    .flatMap((block: { content?: Array<{ text?: string }> }) => block.content ?? [])
    .map((inline: { text?: string }) => inline.text ?? '')
    .join(' ')

  const ticket: JiraTicket = {
    id: data.key,
    summary: data.fields.summary,
    description: descriptionText,
    status: data.fields.status.name,
  }

  return ticket
}

export async function fetchJiraTickets(
  prDescription: string,
  jiraUrl: string,
  email: string,
  token: string
): Promise<string> {
  const ticketIds: string[] = extractJiraTicketIds(prDescription)

  if (ticketIds.length === 0) {
    core.info('No Jira ticket IDs found in PR description')
    return ''
  }

  core.info(`Found Jira tickets: ${ticketIds.join(', ')}`)

  const tickets: JiraTicket[] = []

  for (const id of ticketIds) {
    const ticket: JiraTicket | null = await fetchTicket(id, jiraUrl, email, token)
    if (ticket === null) continue

    if (ticket.status.toLowerCase() !== 'done') {
      core.info(`Skipping ticket ${ticket.id} — status is "${ticket.status}", not Done`)
      continue
    }

    tickets.push(ticket)
  }

  if (tickets.length === 0) {
    core.info('No Done tickets found, skipping Jira context')
    return ''
  }

  const formatted: string = tickets
    .map((t: JiraTicket) => `Ticket ${t.id} (${t.status})\nSummary: ${t.summary}\nDescription: ${t.description}`)
    .join('\n\n')

  return formatted
}