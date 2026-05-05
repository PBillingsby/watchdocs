"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postPRComment = postPRComment;
function buildCommentBody(analysis) {
    const lines = [];
    lines.push('## 👀 WatchDocs');
    lines.push('');
    lines.push(analysis.summary);
    lines.push('');
    lines.push('The following documentation files may need updating:');
    lines.push('');
    for (const issue of analysis.issues) {
        lines.push(`**\`${issue.file}\`**`);
        lines.push(`${issue.reason}`);
        lines.push('');
    }
    lines.push('---');
    lines.push('*Powered by [WatchDocs](https://github.com/pbillingsby/watchdocs-action)*');
    return lines.join('\n');
}
async function postPRComment(octokit, owner, repo, prNumber, analysis) {
    const body = buildCommentBody(analysis);
    await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body,
    });
}
