# Deployment Patterns

How to deploy generated MCP servers and CLI tools to production.

## Pattern 1: Runtime Mode (Simplest)

No deployment needed. Add to settings.json and go.

```json
{
  "mcpServers": {
    "stripe": {
      "command": "npx",
      "args": ["ay-api-gen", "serve", "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json"],
      "env": { "API_KEY": "sk_test_..." }
    }
  }
}
```

Works immediately. Spec is fetched at startup.

## Pattern 2: Generate + Commit

Generate files and commit to your repo.

```bash
ay-api-gen https://api.example.com/openapi.json --name my-api
git add .ay/apis/my-api/
git commit -m "Add my-api MCP server and CLI"
```

Other devs clone and it works. MCP server is auto-registered.

## Pattern 3: GitHub Actions Auto-Regen

Keep generated code in sync when the spec changes.

```yaml
# .github/workflows/regen-api.yml
name: Regenerate API Tools
on:
  schedule:
    - cron: '0 6 * * 1'  # Weekly Monday 6am
  workflow_dispatch:

jobs:
  regen:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm install
      - run: npx ay-api-gen regen --all --no-settings
      - name: Commit changes
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add .ay/apis/
          git diff --cached --quiet || git commit -m "chore: regenerate API tools from latest specs"
          git push
```

## Pattern 4: Auto-Deploy to Standalone Repo

Generate and push to a dedicated repo that other projects consume.

```yaml
# .github/workflows/deploy-mcp.yml
name: Deploy MCP Servers
on:
  push:
    paths: ['specs/*.json']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm i -g ay-api-gen

      - name: Generate all specs
        run: |
          for spec in specs/*.json; do
            name=$(basename "$spec" .json)
            ay-api-gen "$spec" --name "$name" --output "dist/$name" --no-settings
          done

      - name: Push to deploy repo
        uses: cpina/github-action-push-to-another-repository@main
        env:
          SSH_DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
        with:
          source-directory: dist/
          destination-github-username: your-org
          destination-repository-name: mcp-servers
          target-branch: main
          commit-message: "Deploy MCP servers from ${{ github.sha }}"
```

## Pattern 5: Docker Container

Package MCP servers as containers.

```dockerfile
# Dockerfile
FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY .ay/apis/ .ay/apis/
# Serve a specific API
CMD ["node", ".ay/apis/my-api/mcp-server.js"]
```

```yaml
# docker-compose.yml
services:
  stripe-mcp:
    build: .
    command: node node_modules/ay-api-gen/src/runtime/mcp-server.js https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json
    environment:
      - API_KEY=${STRIPE_KEY}
    stdin_open: true
```

## Pattern 6: Vercel Serverless (HTTP-SSE transport)

For remote MCP servers accessible over HTTP:

```js
// api/mcp/[...path].js
import { loadSpec, extractEndpoints } from "ay-api-gen";
// Wrap with HTTP-SSE transport instead of stdio
// See: @modelcontextprotocol/sdk docs for SSEServerTransport
```

## Pattern 7: Multi-Spec Monorepo

```
my-project/
├── specs/
│   ├── stripe.json
│   ├── github.json
│   └── internal-api.json
├── .ay/apis/          # Generated
│   ├── stripe/
│   ├── github/
│   └── internal-api/
├── .claude/
│   └── settings.local.json  # Auto-populated
└── package.json
```

```bash
# Generate all at once
for spec in specs/*.json; do
  ay-api-gen "$spec" --name "$(basename "$spec" .json)"
done
```

## Pattern 8: Spec Watch (Dev Mode)

Watch for spec changes and auto-regenerate:

```bash
# Using fswatch or nodemon
fswatch -o specs/ | while read; do
  ay-api-gen regen --all --no-settings
  echo "Regenerated at $(date)"
done
```

## Which Pattern to Use

| Scenario | Pattern |
|----------|---------|
| Quick test / prototyping | 1 (Runtime) |
| Team project | 2 (Generate + Commit) |
| Spec evolves frequently | 3 (GitHub Actions) |
| Sharing MCP servers across projects | 4 (Deploy Repo) |
| Production / isolated | 5 (Docker) |
| Remote MCP server | 6 (Vercel) |
| Multiple APIs in one project | 7 (Monorepo) |
| Active development | 8 (Watch) |
