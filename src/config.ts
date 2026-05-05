import * as fs from 'fs'
import * as yaml from 'js-yaml'

export interface WatchDocsConfig {
  sources: {
    github_pr: boolean
    changelog: boolean
    jira: boolean
    notion: boolean
  }
  docs: {
    paths: string[]
  }
}

export function loadConfig(configPath: string): WatchDocsConfig {
  const defaults: WatchDocsConfig = {
    sources: {
      github_pr: true,
      changelog: true,
      jira: false,
      notion: false,
    },
    docs: {
      paths: ['docs'],
    },
  }

  if (!fs.existsSync(configPath)) {
    return defaults
  }

  const raw = fs.readFileSync(configPath, 'utf-8')
  const parsed = yaml.load(raw) as Partial<WatchDocsConfig>

  return {
    sources: { ...defaults.sources, ...parsed.sources },
    docs: { ...defaults.docs, ...parsed.docs },
  }
}