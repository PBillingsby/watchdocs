import { analyzeWithClaude } from '../analyzer'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config()

const anthropicKey: string = process.env.ANTHROPIC_API_KEY ?? ''

if (!anthropicKey) {
  console.error('Missing ANTHROPIC_API_KEY in .env')
  process.exit(1)
}

const prDiff: string = `
File: src/emails.ts
Status: modified
+export async function cancelEmail(id: string): Promise<void> {
+  await fetch(\`/emails/\${id}\`, { method: 'DELETE' })
+}
+
+export async function sendEmail(params: SendEmailParams): Promise<void> {
+  // added scheduledAt support
+  await fetch('/emails', {
+    method: 'POST',
+    body: JSON.stringify(params)
+  })
+}
`

const prDescription: string = `
## What changed
- Added cancelEmail() function for cancelling scheduled emails
- Added scheduledAt parameter to sendEmail()
- Added 422 validation errors with field-level messages

Jira: PROJ-123
`

const changelog: string = fs.readFileSync(
  path.join(__dirname, '../../test-repo/CHANGELOG.md'),
  'utf-8'
)

const docContent: string = fs.readFileSync(
  path.join(__dirname, '../../test-repo/docs/api-reference.md'),
  'utf-8'
)

async function runTest(): Promise<void> {
  console.log('Running WatchDocs test...\n')

  const result = await analyzeWithClaude({
    anthropicKey,
    prDiff,
    prDescription,
    changelog,
    jiraContext: '',
    notionContext: '',
    docFiles: [
      {
        path: 'test-repo/docs/api-reference.md',
        content: docContent,
      },
    ],
  })

  console.log('Result:\n')
  console.log(JSON.stringify(result, null, 2))
}

runTest().catch(console.error)