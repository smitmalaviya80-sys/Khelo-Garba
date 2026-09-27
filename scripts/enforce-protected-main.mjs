/**
 * Run this script with a GitHub PAT to configure branch protection for main.
 * Ensure the PAT has repo admin permissions.
 *
 * Example:
 * GITHUB_TOKEN=ghp_... node scripts/enforce-protected-main.mjs owner repo
 */

import https from 'node:https';

const token = process.env.GITHUB_TOKEN;
const args = process.argv.slice(2);
const owner = args[0] || 'ruddvz'; // Update with default org/user
const repo = args[1] || 'garba'; // Update with default repo

if (!token) {
  console.error("Please provide GITHUB_TOKEN environment variable.");
  process.exit(1);
}

const data = JSON.stringify({
  required_status_checks: {
    strict: true, // Require branches to be up to date before merging
    contexts: [
      "main-guard",
      "validate",
      "claim" // from agent-claim-pr-guard.yml
    ]
  },
  enforce_admins: true,
  required_pull_request_reviews: {
    dismiss_stale_reviews: true,
    require_code_owner_reviews: false,
    required_approving_review_count: 1
  },
  restrictions: null
});

const options = {
  hostname: 'api.github.com',
  port: 443,
  path: `/repos/${owner}/${repo}/branches/main/protection`,
  method: 'PUT',
  headers: {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'User-Agent': 'Node.js'
  }
};

const req = https.request(options, (res) => {
  let responseBody = '';
  res.on('data', (chunk) => { responseBody += chunk; });
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('Successfully enforced branch protection on main.');
    } else {
      console.error(`Failed to enforce branch protection: ${res.statusCode}`);
      console.error(responseBody);
    }
  });
});

req.on('error', (error) => {
  console.error(error);
});

req.write(data);
req.end();
