# 👀 WatchDocs

WatchDocs is a GitHub Action that automatically detects missing or outdated documentation when a PR is opened. It reads your PR diff, changelog, and linked Jira tickets to identify gaps before they ship.

## How it works

1. A PR is opened targeting `main`
2. WatchDocs reads the code diff, changelog, and any linked Jira tickets
3. Claude analyzes the changes against your existing docs
4. A comment is posted on the PR listing exactly what needs updating and why

## Setup

### 1. Add the workflow file

Create `.github/workflows/watchdocs.yml` in your repo:

```yaml
name: WatchDocs

on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches:
      - main
      - master

jobs:
  watchdocs:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: actions/checkout@v4

      - uses: PBillingsby/watchdocs@main
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
          jira_url: ${{ secrets.JIRA_URL }}
          jira_token: ${{ secrets.JIRA_TOKEN }}
          jira_email: ${{ secrets.JIRA_EMAIL }}
          notion_token: ${{ secrets.NOTION_TOKEN }}
```

### 2. Add the config file

Create `watchdocs.config.yml` in your repo root:

```yaml
sources:
  github_pr: true
  changelog: true
  jira: false
  notion: false

docs:
  paths:
    - docs
```

Enable the sources your team uses and point `docs.paths` at where your markdown files live.

### 3. Add secrets

Go to your repo **Settings > Secrets and variables > Actions** and add:

| Secret | Required | Description |
|--------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |
| `JIRA_URL` | If using Jira | Your Jira instance URL e.g. `https://yourteam.atlassian.net` |
| `JIRA_TOKEN` | If using Jira | Jira API token from id.atlassian.com/manage-profile/security/api-tokens |
| `JIRA_EMAIL` | If using Jira | Email address on your Atlassian account |
| `NOTION_TOKEN` | If using Notion | Notion integration token |

`GITHUB_TOKEN` is provided automatically by GitHub -- no setup needed.

## Sources

WatchDocs supports multiple context sources. Enable only what your team uses.

### GitHub PR (always on)
Reads the code diff from the PR to understand what changed.

### Changelog
Looks for a `CHANGELOG.md` in your repo root and uses recent entries as additional context.

### Jira
Add a Jira ticket ID anywhere in your PR description (e.g. `PROJ-123`) and WatchDocs will fetch the ticket summary and description. Only tickets with `Done` status are used -- in-progress work is ignored.

### Notion
Paste a Notion page URL anywhere in your PR description and WatchDocs will fetch the page content as additional context.

## Example output

> **The API reference is missing the new cancelEmail endpoint, the scheduledAt parameter, and the 422 error response code.**
>
> 📄 `/docs/api-reference.md`
> - ⚠️ Missing documentation for the new DELETE /emails/{id} endpoint which returns 204 on success and 404 if the email ID is not found
> - ⚠️ Missing the new `scheduledAt` parameter in the Send Email parameters table
> - ⚠️ Missing the 422 status code in the response codes table

## License

MIT