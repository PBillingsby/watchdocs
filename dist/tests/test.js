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
const analyzer_1 = require("../analyzer");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';
if (!anthropicKey) {
    console.error('Missing ANTHROPIC_API_KEY in .env');
    process.exit(1);
}
const prDiff = `
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
`;
const prDescription = `
## What changed
- Added cancelEmail() function for cancelling scheduled emails
- Added scheduledAt parameter to sendEmail()
- Added 422 validation errors with field-level messages

Jira: PROJ-123
`;
const changelog = fs.readFileSync(path.join(__dirname, '../../test-repo/CHANGELOG.md'), 'utf-8');
const docContent = fs.readFileSync(path.join(__dirname, '../../test-repo/docs/api-reference.md'), 'utf-8');
async function runTest() {
    console.log('Running WatchDocs test...\n');
    const result = await (0, analyzer_1.analyzeWithClaude)({
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
    });
    console.log('Result:\n');
    console.log(JSON.stringify(result, null, 2));
}
runTest().catch(console.error);
