"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchPRDiff = fetchPRDiff;
async function fetchPRDiff(octokit, owner, repo, prNumber) {
    const { data: pr } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
    });
    const { data: files } = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: prNumber,
    });
    const diffParts = [];
    for (const file of files) {
        if (file.filename.startsWith('docs/'))
            continue;
        const patch = file.patch ?? '';
        const part = `File: ${file.filename}\nStatus: ${file.status}\n${patch}`;
        diffParts.push(part);
    }
    const diff = diffParts.join('\n\n').slice(0, 6000);
    return {
        diff,
        description: pr.body ?? '',
        title: pr.title,
    };
}
