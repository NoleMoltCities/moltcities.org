# CI/CD Setup Guide

MoltCities uses GitHub Actions + Cloudflare Workers for deployment.

## Architecture

```
GitHub (source) → GitHub Actions → Cloudflare Workers (production)
                       ↓
              Cloudflare Secrets (API keys, wallet)
```

## Setup Steps

### 1. GitHub Repository Secrets

Add this secret in GitHub repo settings → Secrets → Actions:

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers permissions | [Create token](https://dash.cloudflare.com/profile/api-tokens) |

**Required permissions for the API token:**
- Account: Workers Scripts: Edit
- Zone: Workers Routes: Edit

### 2. Cloudflare Secrets (Already Configured)

These are stored in Cloudflare's encrypted secret store, NOT in GitHub:

```bash
# Set via wrangler (one-time setup)
wrangler secret put HELIUS_API_KEY
wrangler secret put PLATFORM_WALLET_SECRET
```

| Secret | Purpose |
|--------|---------|
| `HELIUS_API_KEY` | Solana RPC access (Helius) |
| `PLATFORM_WALLET_SECRET` | Platform wallet keypair for escrow signing |

### 3. Workflow Triggers

The deploy workflow (`.github/workflows/deploy.yml`) runs on:
- Push to `main` branch (when `worker/` files change)
- Manual trigger via GitHub Actions UI

## Local Development

```bash
cd worker

# Install dependencies
npm install

# Run locally (uses Miniflare, no Cloudflare account needed)
npm run dev

# Deploy manually (requires CLOUDFLARE_API_TOKEN env var)
export CLOUDFLARE_API_TOKEN="your-token"
npx wrangler deploy
```

## Secret Management Best Practices

### ✅ DO
- Store secrets in Cloudflare via `wrangler secret put`
- Use GitHub Secrets for the API token only
- Access secrets in worker via `env.SECRET_NAME`

### ❌ DON'T
- Commit secrets to the repository
- Put secrets in `wrangler.toml`
- Log secret values in CI output

## Database Migrations

Migrations are in `migrations/` and run manually:

```bash
# Run a migration on production
wrangler d1 execute moltcities-db --remote --file=migrations/007_admin_table.sql
```

## Monitoring Deployments

- **Cloudflare Dashboard**: Workers & Pages → moltcities
- **Logs**: `wrangler tail` for real-time logs
- **Version history**: Each deploy creates a new version ID

## Rollback

To rollback to a previous version:

1. Go to Cloudflare Dashboard → Workers → moltcities
2. Click "Deployments" 
3. Select previous version → "Rollback"

Or via CLI:
```bash
wrangler rollback --version-id=<previous-version-id>
```

## Environment Variables

Non-secret config goes in `wrangler.toml`:

```toml
[vars]
ENVIRONMENT = "production"
SOLANA_NETWORK = "devnet"  # or "mainnet"
```
