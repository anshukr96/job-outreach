# Job Outreach Bot

Automated job application outreach system that bypasses ATS portals by emailing hiring managers directly with personalized cold emails. Implementation of the PRD shipped alongside this repo.

## Pipeline at a glance

```
GitHub Actions (cron)
    -> Scrape LinkedIn + Naukri (Playwright)
    -> Dedupe against Supabase
    -> Find hiring manager (Apollo.io, Hunter fallback)
    -> Generate email (Claude)
    -> Send via Gmail App Password (Nodemailer)
    -> Track in Supabase
```

Hard limit: 15 cold emails per day.

## Quick start

```bash
# 1. Install
npm install
npx playwright install chromium

# 2. Configure
cp .env.example .env
# fill in every value

# 3. Set up Supabase
# In Supabase -> SQL Editor, paste & run supabase/schema.sql

# 4. Personalize
# Edit src/context/resume.js with your details

# 5. Smoke-test individual modules
node src/scrapers/linkedin.js
node src/scrapers/naukri.js
node src/enrichment/apollo.js razorpay.com
node src/generator/emailGenerator.js

# 6. Run end-to-end (LOCAL TEST ONLY — set DAILY_LIMIT=1 first!)
DAILY_LIMIT=1 node src/index.js
```

## Required secrets

Add all of these to `.env` (local) AND GitHub Actions secrets (production):

| Secret | Where to get it |
|---|---|
| `LINKEDIN_COOKIE` | Browser DevTools -> Application -> Cookies -> `li_at` |
| `APOLLO_API_KEY` | apollo.io -> Settings -> Integrations -> API Keys |
| `ANTHROPIC_API_KEY` | console.anthropic.com -> API Keys (NOT the same as Claude.ai sub) |
| `SUPABASE_URL`, `SUPABASE_KEY` | supabase.com -> Project Settings -> API |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Create a new Gmail, enable 2FA, then myaccount.google.com/apppasswords |
| `HUNTER_API_KEY` | optional fallback — hunter.io free tier |
| `SLACK_WEBHOOK` | optional — failure alerts |
| `SENDER_NAME` | optional — display name on outgoing mail |

## Email warmup (mandatory before going live)

Do not skip this. New Gmail accounts that send 15 cold emails on day one get burned.

| Day | Volume |
|---|---|
| 1-3 | 5/day to your own accounts |
| 4-6 | 10/day to friends |
| 7-10 | 15/day |
| 11+ | Production. Cap at 15/day HARD LIMIT |

## Implementation phases

1. **Foundation** — repo, Supabase schema, Gmail account, API keys
2. **Scrapers** — `node src/scrapers/linkedin.js` (and naukri) end up in `jobs` table
3. **Enrichment** — `node src/enrichment/apollo.js razorpay.com` returns a manager
4. **Generator + sender** — fill in `src/context/resume.js`, manually review 5 generated emails
5. **Warmup** — see table above
6. **Go live** — enable the GitHub Actions workflow
7. **Optimize** — review reply rates, A/B test subject lines, run `node src/followup.js`

## Files

```
job-outreach-bot/
├── .github/workflows/daily-outreach.yml
├── supabase/schema.sql
├── src/
│   ├── index.js              ← orchestrator
│   ├── followup.js           ← 3-day bump email runner
│   ├── scrapers/
│   │   ├── linkedin.js
│   │   └── naukri.js
│   ├── enrichment/
│   │   ├── apollo.js
│   │   └── emailGuesser.js
│   ├── generator/emailGenerator.js
│   ├── sender/emailSender.js
│   ├── db/supabase.js
│   ├── context/resume.js
│   └── prompts/emailPrompt.js
├── dashboard/src/App.jsx     ← optional Vite + React UI
├── .env.example
├── package.json
└── README.md
```

## Cost

| Item | Cost |
|---|---|
| GitHub Actions, Supabase, Apollo, Playwright, Nodemailer, Gmail | $0 |
| Anthropic API credits | ~$2-5/mo |
| Optional Webshare proxy | $0-10/mo |
| **Total** | **$2-15/mo** |

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| LinkedIn IP block | Stealth plugin + 3-8s random delays + monthly cookie rotation |
| Gmail spam flag | Warmup + 15/day hard limit + plain text bodies |
| Apollo credits exhausted | Hunter.io fallback in `emailGuesser.js` |
| Wrong manager targeted | Title filter restricted to engineering roles |
| Same person contacted twice | `leads.manager_email` checked before each insert |
| Action timeout | `timeout-minutes: 30` in workflow |

## Notes

- The PRD lives next to this repo as `PRD.md`. Treat the PRD as the spec; this repo is the implementation.
- Selectors on LinkedIn and Naukri change. If a scraper goes silent, run it locally with `headless: false` and update the selectors.
- The orchestrator catches per-job errors and continues — one bad job won't kill the run.
