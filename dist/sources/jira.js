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
exports.fetchJiraTickets = fetchJiraTickets;
const core = __importStar(require("@actions/core"));
function extractJiraTicketIds(text, jiraUrl) {
    const parsed = new URL(jiraUrl);
    const hostname = parsed.hostname;
    const projectKey = hostname.split('.')[0].toUpperCase();
    const regex = new RegExp(`${projectKey}-\\d+`, 'g');
    const matches = text.match(regex);
    const unique = [...new Set(matches ?? [])];
    return unique;
}
async function fetchTicket(ticketId, jiraUrl, email, token) {
    const credentials = Buffer.from(`${email}:${token}`).toString('base64');
    const url = `${jiraUrl}/rest/api/3/issue/${ticketId}`;
    const response = await fetch(url, {
        headers: {
            Authorization: `Basic ${credentials}`,
            Accept: 'application/json',
        },
    });
    if (!response.ok) {
        core.warning(`Failed to fetch Jira ticket ${ticketId}: ${response.status}`);
        return null;
    }
    const data = await response.json();
    const descriptionBlocks = data.fields.description?.content ?? [];
    const descriptionText = descriptionBlocks
        .flatMap((block) => block.content ?? [])
        .map((inline) => inline.text ?? '')
        .join(' ');
    const ticket = {
        id: data.key,
        summary: data.fields.summary,
        description: descriptionText,
        status: data.fields.status.name,
    };
    return ticket;
}
async function fetchJiraTickets(prDescription, jiraUrl, email, token) {
    const ticketIds = extractJiraTicketIds(prDescription, jiraUrl);
    if (ticketIds.length === 0) {
        core.info('No Jira ticket IDs found in PR description');
        return '';
    }
    core.info(`Found Jira tickets: ${ticketIds.join(', ')}`);
    const tickets = [];
    for (const id of ticketIds) {
        const ticket = await fetchTicket(id, jiraUrl, email, token);
        if (ticket !== null)
            tickets.push(ticket);
    }
    if (tickets.length === 0)
        return '';
    const formatted = tickets
        .map((t) => `Ticket ${t.id} (${t.status})\nSummary: ${t.summary}\nDescription: ${t.description}`)
        .join('\n\n');
    return formatted;
}
