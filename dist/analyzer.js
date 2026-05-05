"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeWithClaude = analyzeWithClaude;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
async function analyzeWithClaude(input) {
    const client = new sdk_1.default({ apiKey: input.anthropicKey });
    const docContext = input.docFiles
        .map((f) => `### ${f.path}\n${f.content}`)
        .join('\n\n');
    const sourceContext = [
        input.prDiff ? `## PR Diff\n${input.prDiff}` : '',
        input.prDescription ? `## PR Description\n${input.prDescription}` : '',
        input.changelog ? `## Changelog\n${input.changelog}` : '',
        input.jiraContext ? `## Jira Tickets\n${input.jiraContext}` : '',
        input.notionContext ? `## Notion Pages\n${input.notionContext}` : '',
    ].filter(Boolean).join('\n\n');
    const prompt = `You are WatchDocs, a documentation gap detector. Your job is to identify documentation that is missing or outdated based on code changes.

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
}`;
    const response = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        messages: [
            {
                role: 'user',
                content: prompt,
            },
        ],
    });
    const firstBlock = response.content[0];
    if (firstBlock.type !== 'text') {
        return { hasIssues: false, issues: [], summary: 'No response from Claude' };
    }
    const raw = firstBlock.text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);
    return parsed;
}
