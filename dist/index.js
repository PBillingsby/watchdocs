"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const github_1 = require("./sources/github");
const jira_1 = require("./sources/jira");
const notion_1 = require("./sources/notion");
const analyzer_1 = require("./analyzer");
const comment_1 = require("./comment");
const config_1 = require("./config");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
async function run() {
    try {
        const config = (0, config_1.loadConfig)('watchdocs.config.yml');
        const anthropicKey = core.getInput('anthropic_api_key', { required: true });
        const githubToken = core.getInput('github_token', { required: true });
        const octokit = github.getOctokit(githubToken);
        const context = github.context;
        if (!context.payload.pull_request) {
            core.info('No pull request found, skipping WatchDocs');
            return;
        }
        const prNumber = context.payload.pull_request.number;
        const owner = context.repo.owner;
        const repo = context.repo.repo;
        core.info('Fetching PR diff...');
        const prDiff = await (0, github_1.fetchPRDiff)(octokit, owner, repo, prNumber);
        // fetch changelog if enabled
        let changelog = '';
        if (config.sources.changelog) {
            const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
            if (fs.existsSync(changelogPath)) {
                changelog = fs.readFileSync(changelogPath, 'utf-8').slice(0, 3000);
                core.info('Changelog found and loaded');
            }
            else {
                core.info('No CHANGELOG.md found, skipping');
            }
        }
        // fetch jira tickets if enabled
        let jiraContext = '';
        if (config.sources.jira) {
            core.info('Fetching Jira tickets...');
            const jiraUrl = core.getInput('jira_url');
            const jiraToken = core.getInput('jira_token');
            const jiraEmail = core.getInput('jira_email');
            if (jiraUrl && jiraToken && jiraEmail) {
                jiraContext = await (0, jira_1.fetchJiraTickets)(prDiff.description, jiraUrl, jiraEmail, jiraToken);
            }
            else {
                core.warning('Jira enabled in config but credentials not provided, skipping');
            }
        }
        // fetch notion pages if enabled
        let notionContext = '';
        if (config.sources.notion) {
            core.info('Fetching Notion pages...');
            const notionToken = core.getInput('notion_token');
            if (notionToken) {
                notionContext = await (0, notion_1.fetchNotionPages)(notionToken, prDiff.description);
            }
            else {
                core.warning('Notion enabled in config but token not provided, skipping');
            }
        }
        // load doc files from configured paths
        core.info('Loading documentation files...');
        const docFiles = loadDocFiles(config.docs.paths);
        if (docFiles.length === 0) {
            core.warning('No documentation files found in configured paths, skipping');
            return;
        }
        core.info(`Found ${docFiles.length} documentation files`);
        // run claude analysis
        core.info('Analyzing with Claude...');
        const analysis = await (0, analyzer_1.analyzeWithClaude)({
            anthropicKey,
            prDiff: prDiff.diff,
            prDescription: prDiff.description,
            changelog,
            jiraContext,
            notionContext,
            docFiles,
        });
        if (!analysis.hasIssues) {
            core.info('WatchDocs: No documentation gaps found');
            return;
        }
        // post PR comment
        core.info('Posting PR comment...');
        await (0, comment_1.postPRComment)(octokit, owner, repo, prNumber, analysis);
        core.info('WatchDocs complete');
    }
    catch (error) {
        core.setFailed(`WatchDocs failed: ${error}`);
    }
}
function loadDocFiles(paths) {
    const docFiles = [];
    for (const docPath of paths) {
        const fullPath = path.join(process.cwd(), docPath);
        if (!fs.existsSync(fullPath))
            continue;
        const files = getAllMarkdownFiles(fullPath);
        for (const file of files) {
            const content = fs.readFileSync(file, 'utf-8');
            docFiles.push({
                path: file.replace(process.cwd(), ''),
                content: content.slice(0, 2000), // cap per file to manage context
            });
        }
    }
    return docFiles;
}
function getAllMarkdownFiles(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...getAllMarkdownFiles(fullPath));
        }
        else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
            results.push(fullPath);
        }
    }
    return results;
}
run();
