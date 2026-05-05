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
exports.fetchNotionPages = fetchNotionPages;
const core = __importStar(require("@actions/core"));
function extractNotionPageIds(text) {
    const regex = /notion\.so\/(?:[a-zA-Z0-9-]+\/)?([a-f0-9]{32})/g;
    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        matches.push(match[1]);
    }
    const unique = [...new Set(matches)];
    return unique;
}
async function fetchPageTitle(pageId, token) {
    const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            'Notion-Version': '2022-06-28',
        },
    });
    if (!response.ok) {
        core.warning(`Failed to fetch Notion page ${pageId}: ${response.status}`);
        return 'Untitled';
    }
    const data = await response.json();
    const titleBlocks = data.properties?.title?.title ?? [];
    const title = titleBlocks[0]?.plain_text ?? 'Untitled';
    return title;
}
async function fetchPageContent(pageId, token) {
    const response = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
        headers: {
            Authorization: `Bearer ${token}`,
            'Notion-Version': '2022-06-28',
        },
    });
    if (!response.ok) {
        core.warning(`Failed to fetch Notion page content ${pageId}: ${response.status}`);
        return '';
    }
    const data = await response.json();
    const blocks = data.results ?? [];
    const lines = blocks.map((block) => {
        const richTextBlock = block.paragraph ??
            block.heading_1 ??
            block.heading_2 ??
            block.heading_3 ??
            block.bulleted_list_item ??
            block.numbered_list_item;
        const richTexts = richTextBlock?.rich_text ?? [];
        const line = richTexts.map((rt) => rt.plain_text ?? '').join('');
        return line;
    });
    const content = lines.filter(Boolean).join('\n').slice(0, 3000);
    return content;
}
async function fetchNotionPages(token, prDescription) {
    const pageIds = extractNotionPageIds(prDescription);
    if (pageIds.length === 0) {
        core.info('No Notion page links found in PR description');
        return '';
    }
    core.info(`Found Notion pages: ${pageIds.join(', ')}`);
    const pages = [];
    for (const id of pageIds) {
        const title = await fetchPageTitle(id, token);
        const content = await fetchPageContent(id, token);
        const page = { id, title, content };
        pages.push(page);
    }
    if (pages.length === 0)
        return '';
    const formatted = pages
        .map((p) => `Notion Page: ${p.title}\n${p.content}`)
        .join('\n\n');
    return formatted;
}
