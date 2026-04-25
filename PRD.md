# PRD: Automated Job Application Outreach System

**Version:** 1.0
**Author:** [Your Name]
**Role:** Senior Frontend Engineer
**Status:** Ready for Implementation

---

## 1. Overview

### 1.1 Problem Statement

Manually applying to jobs through ATS portals results in a "black hole" effect where resumes are never seen by actual humans. The goal is to bypass ATS systems entirely by directly reaching out to hiring managers with personalized, automated cold emails at scale.

### 1.2 Goal

Build a fully automated, zero-to-minimal-cost pipeline that:

- Scrapes fresh job postings daily
- Finds the hiring manager's email
- Generates a personalized cold email using Claude
- Sends the email automatically
- Tracks all activity in a dashboard

### 1.3 Success Metrics

- Send 10-15 high-quality cold emails per day
- Achieve a reply rate of 10-15% within 30 days
- Zero manual intervention required after initial setup
- System runs fully on cloud (not dependent on local machine)

---

## 2. Tech Stack

| Layer | Tool | Cost | Why |
|---|---|---|---|
| **Orchestration** | GitHub Actions | Free | Cron-based cloud runner |
| **Scraping** | Playwright (Node.js) | Free | Handles JS-heavy sites like LinkedIn |
| **Database** | Supabase | Free Tier | Stores jobs, leads, sent status |
| **Manager Lookup** | Apollo.io API | Free Tier | Finds verified emails |
| **Email Validation** | Apollo Built-in | Free | Prevent bounces |
| **AI Generation** | Claude API or GPT-4o-mini | ~$5/mo | Personalized email body |
| **Email Sending** | Nodemailer + Gmail | Free | Sends via Gmail App Password |
| **Dashboard** | Supabase Table View + React | Free | Track all activity |
| **Proxy (Optional)** | Webshare.io | $0-10/mo | Avoid LinkedIn IP bans |

---

## 3. System Architecture

```txt
┌─────────────────────────────────────────────────────────┐
│                  GITHUB ACTIONS (CRON)                  │
│                  Runs Every Day 9:00 AM                 │
└─────────────────────────────┬───────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│                  MODULE 1: SCRAPER                      │
│         Playwright scrapes LinkedIn + Naukri            │
│         Extracts: Job ID, Title, Company, JD            │
└─────────────────────────────┬───────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│                MODULE 2: DEDUPLICATION                  │
│         Check Supabase: Is this Job ID new?             │
│         YES → Proceed   NO → Skip                       │
└─────────────────────────────┬───────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│              MODULE 3: MANAGER LOOKUP                   │
│         Apollo.io API: Find Engineering Manager         │
│         by Company Domain                               │
│         Output: Name, Email, LinkedIn URL               │
└─────────────────────────────┬───────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│            MODULE 4: EMAIL GENERATION                   │
│         Claude/GPT-4o-mini reads JD + Resume            │
│         Generates: Subject Line + Email Body            │
│         Personalized to Company + Tech Stack            │
└─────────────────────────────┬───────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│              MODULE 5: EMAIL SENDING                    │
│         Nodemailer + Gmail App Password                 │
│         Max 15 emails/day hard limit                    │
│         Attaches Resume as Google Drive Link            │
└─────────────────────────────┬───────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│              MODULE 6: TRACKING                         │
│         Update Supabase: Sent Status, Timestamp         │
│         View Dashboard in React or Supabase UI          │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Database Schema (Supabase)

### Table 1: `jobs`

```sql
CREATE TABLE jobs (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id        TEXT UNIQUE NOT NULL,        -- LinkedIn/Naukri Job ID
  title         TEXT NOT NULL,               -- "Senior Frontend Engineer"
  company_name  TEXT NOT NULL,               -- "Razorpay"
  company_domain TEXT,                       -- "razorpay.com"
  job_url       TEXT,                        -- Original job posting URL
  job_description TEXT,                      -- Full JD text
  source        TEXT,                        -- "linkedin" | "naukri"
  posted_at     TIMESTAMP,                   -- When job was posted
  scraped_at    TIMESTAMP DEFAULT NOW(),     -- When we found it
  status        TEXT DEFAULT 'new'           -- "new" | "processed" | "skipped"
);
```

### Table 2: `leads`

```sql
CREATE TABLE leads (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id        TEXT REFERENCES jobs(job_id),
  manager_name  TEXT,                        -- "Rahul Sharma"
  manager_title TEXT,                        -- "Engineering Manager"
  manager_email TEXT,                        -- "rahul@razorpay.com"
  linkedin_url  TEXT,                        -- Manager's LinkedIn
  email_verified BOOLEAN DEFAULT FALSE,
  apollo_confidence TEXT,                    -- "high" | "medium" | "low"
  created_at    TIMESTAMP DEFAULT NOW()
);
```

### Table 3: `outreach`

```sql
CREATE TABLE outreach (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  lead_id       UUID REFERENCES leads(id),
  job_id        TEXT REFERENCES jobs(job_id),
  subject_line  TEXT,                        -- Generated subject
  email_body    TEXT,                        -- Generated body
  sent_at       TIMESTAMP,                   -- When email was fired
  status        TEXT DEFAULT 'pending',      -- "pending"|"sent"|"failed"
  reply_received BOOLEAN DEFAULT FALSE,
  reply_at      TIMESTAMP,
  follow_up_count INT DEFAULT 0,
  notes         TEXT                         -- Manual notes if needed
);
```

---

## 5. Module Specifications

### MODULE 1: Scraper

#### 1.1 LinkedIn Scraper

```txt
File: src/scrapers/linkedin.js

Input:
  - Search Query: "Senior Frontend Engineer" OR "Fullstack Engineer"
  - Filters: Posted in last 24h, India (or Remote)
  - Max Results: 50 per run

Steps:
  1. Launch Playwright in headless mode
  2. Load LinkedIn session cookie from ENV variable
     (Do not log in every time, use saved cookies)
  3. Navigate to:
     https://www.linkedin.com/jobs/search/?keywords=Senior+Frontend+Engineer&f_TPR=r86400
  4. Scroll to load all cards (infinite scroll handler)
  5. For each card extract:
     - job_id (from data attribute or URL param)
     - title
     - company_name
     - job_url
     - posted_time
  6. Click into each job URL and extract:
     - full job_description (innerText of .description div)
     - company_domain (parse from company LinkedIn URL)
  7. Return array of job objects
  8. Add random delay between 3-8 seconds between each click
     to avoid bot detection

Anti-Bot Config:
  - Use stealth plugin: playwright-extra + puppeteer-extra-plugin-stealth
  - Set viewport: 1366x768
  - Set User-Agent to a real Chrome UA string
  - Add slowMo: 1500ms
```

#### 1.2 Naukri Scraper

```txt
File: src/scrapers/naukri.js

Input:
  - URL: https://www.naukri.com/senior-frontend-developer-jobs
  - Filter: Last 1 day

Steps:
  1. Navigate to Naukri search URL
  2. Naukri is less aggressive than LinkedIn for scraping
  3. Extract: Job Title, Company Name, Job URL, Posted Date
  4. Click into each URL for full JD
  5. Parse company domain from company name
     using Clearbit Logo API (free):
     https://logo.clearbit.com/{company}.com
     If it returns 200, domain is valid

Output: Same schema as LinkedIn scraper
```

### MODULE 2: Deduplication

```txt
File: src/deduplicator.js

Logic:
  1. Take array of scraped jobs
  2. For each job, query Supabase:
     SELECT id FROM jobs WHERE job_id = $1
  3. If exists → mark as "duplicate", skip
  4. If not exists → INSERT into jobs table, mark as "new"
  5. Return only the "new" jobs array for further processing

Edge Cases:
  - Same company posts same role twice → handled by unique job_id
  - Same role at different companies → treated as separate leads (correct)
```

### MODULE 3: Manager Lookup

#### 3.1 Apollo.io Integration

```txt
File: src/enrichment/apollo.js

Endpoint: POST https://api.apollo.io/v1/people/match
Headers: { "X-Api-Key": process.env.APOLLO_API_KEY }

Request Body:
{
  "organization_domain": "razorpay.com",
  "title": [
    "Engineering Manager",
    "VP Engineering",
    "Head of Engineering",
    "CTO",
    "Director of Engineering"
  ],
  "page": 1,
  "per_page": 1
}

Response Handling:
  - If person found AND email confidence = "high" → use it
  - If confidence = "medium" → use but flag in DB
  - If no result → try title "Tech Lead" as fallback
  - If still no result → mark lead as "no_manager_found", skip

Output:
  {
    name: "Rahul Sharma",
    email: "rahul@razorpay.com",
    title: "Engineering Manager",
    linkedin: "linkedin.com/in/rahulsharma",
    confidence: "high"
  }
```

#### 3.2 Email Pattern Guesser (Fallback)

```txt
File: src/enrichment/emailGuesser.js

Logic:
  If Apollo returns no result:
  1. Get manager's first and last name from LinkedIn manually
     (or from Apollo people search even if email not found)
  2. Generate email pattern candidates:
     - firstname@company.com
     - firstname.lastname@company.com
     - f.lastname@company.com
     - firstnamelastname@company.com
  3. Verify each using:
     GET https://api.hunter.io/v2/email-verifier?email={email}
     &api_key={HUNTER_FREE_KEY}
     Hunter.io gives 25 free verifications/month
  4. Use the first one that returns "deliverable: true"
```

### MODULE 4: Email Generation

#### 4.1 Resume Context (Static)

```javascript
// File: src/context/resume.js

const MY_RESUME = {
  name: "Your Name",
  currentRole: "Senior Frontend Engineer",
  yearsOfExperience: 6,
  skills: [
    "React",
    "Next.js",
    "TypeScript",
    "Node.js",
    "GraphQL",
    "Performance Optimization",
    "Design Systems"
  ],
  achievements: [
    "Reduced bundle size by 60% at [Company] using code splitting",
    "Built a Design System used by 12 teams at [Company]",
    "Migrated legacy CRA app to Next.js, improving LCP by 40%",
    "Led frontend architecture for a team of 8 engineers"
  ],
  portfolioUrl: "https://yourportfolio.com",
  resumeUrl: "https://drive.google.com/your-resume-link",
  loomUrl: "https://loom.com/your-demo-video"
};

module.exports = MY_RESUME;
```

#### 4.2 Claude Prompt Template

```javascript
// File: src/prompts/emailPrompt.js

const generatePrompt = (jobDescription, managerName, companyName, resume) => `
You are writing a cold outreach email from ${resume.name},
a Senior Frontend Engineer with ${resume.yearsOfExperience} years of experience.

MANAGER NAME: ${managerName}
COMPANY: ${companyName}

JOB DESCRIPTION:
${jobDescription}

MY ACHIEVEMENTS:
${resume.achievements.join('\n')}

MY SKILLS: ${resume.skills.join(', ')}

RULES FOR THE EMAIL:
1. Subject line must be specific, not generic.
   BAD: "Interested in Frontend Role"
   GOOD: "Next.js Migration + 6 yrs Frontend — Quick note"
2. Email body must be 4 sentences MAX.
3. Sentence 1: Mention ONE specific tech from their JD and connect
   it to a specific achievement from my resume.
4. Sentence 2: Mention ONE specific thing about their company
   (their product, their scale, their stack) that genuinely interests you.
5. Sentence 3: One line credibility statement.
6. Sentence 4: Low friction CTA.
   NOT "Please find attached my resume."
   YES "Happy to do a 15-min technical chat if the timing works."
7. Do NOT use: "I hope this finds you well", "I am writing to",
   "Please consider my application"
8. Sign off with: Resume: [URL] | Portfolio: [URL]
9. Tone: Direct, engineer-to-engineer. Not desperate.

OUTPUT FORMAT (JSON only, no extra text):
{
  "subject": "...",
  "body": "..."
}
`;

module.exports = { generatePrompt };
```

#### 4.3 Claude API Call

```javascript
// File: src/generator/emailGenerator.js

const Anthropic = require("@anthropic-ai/sdk");
const { generatePrompt } = require("../prompts/emailPrompt");
const MY_RESUME = require("../context/resume");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateEmail(jobDescription, managerName, companyName) {
  const prompt = generatePrompt(jobDescription, managerName, companyName, MY_RESUME);

  const message = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }]
  });

  const response = JSON.parse(message.content[0].text);

  return {
    subject: response.subject,
    body: response.body
  };
}

module.exports = { generateEmail };

/*
  COST NOTE:
  claude-3-5-sonnet: ~$0.003 per email
  15 emails/day × 30 days = 450 emails/month
  Total cost: ~$1.35/month

  IMPORTANT:
  Claude.ai subscription ($20/mo) ≠ Claude API access.
  You need to separately add credits at console.anthropic.com
  Add $5 in credits. This will last 3+ months at this volume.
*/
```

### MODULE 5: Email Sending

#### 5.1 Gmail Setup (One-Time Manual Steps)

```txt
1. Create new Gmail: yourname.jobs@gmail.com
2. Enable 2FA on this account
3. Go to: myaccount.google.com/apppasswords
4. Create App Password for "Mail"
5. Save the 16-character password in GitHub Secrets
   as GMAIL_APP_PASSWORD

Warmup Schedule (MANDATORY before running pipeline):
  Day 1-3:   Send 5 emails/day to your own other accounts
  Day 4-6:   Send 10 emails/day to friends
  Day 7-10:  Send 15 emails/day
  Day 11+:   Production mode. Cap at 15 cold emails/day HARD LIMIT
```

#### 5.2 Nodemailer Config

```javascript
// File: src/sender/emailSender.js

const nodemailer = require('nodemailer');
const { getDailySentCount } = require('../db/supabase');

const DAILY_LIMIT = 15;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

async function sendEmail(to, subject, body) {
  // Guard: Check daily limit before every send
  const sentToday = await getDailySentCount();
  if (sentToday >= DAILY_LIMIT) {
    console.log('Daily send limit reached. Aborting.');
    return { success: false, reason: 'daily_limit_reached' };
  }

  const mailOptions = {
    from: `Your Name <${process.env.GMAIL_USER}>`,
    to: to,
    subject: subject,
    text: body,
    html: `<p>${body.replace(/\n/g, '<br>')}</p>`
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { sendEmail };
```

### MODULE 6: Tracking

#### 6.1 Supabase DB Operations

```javascript
// File: src/db/supabase.js

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function getDailySentCount() {
  const { count } = await supabase
    .from('outreach')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'sent')
    .gte('sent_at', new Date(Date.now() - 86400000).toISOString());
  return count || 0;
}

async function saveJob(job) {
  const { data, error } = await supabase
    .from('jobs')
    .insert(job)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function isJobNew(jobId) {
  const { data } = await supabase
    .from('jobs')
    .select('id')
    .eq('job_id', jobId)
    .single();
  return !data;
}

async function saveLead(lead) {
  const { data, error } = await supabase
    .from('leads')
    .insert(lead)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function saveOutreach(outreach) {
  const { data, error } = await supabase
    .from('outreach')
    .insert(outreach)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function markAsSent(outreachId) {
  await supabase
    .from('outreach')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', outreachId);
}

async function markAsFailed(outreachId, reason) {
  await supabase
    .from('outreach')
    .update({ status: 'failed', notes: reason })
    .eq('id', outreachId);
}

module.exports = {
  getDailySentCount,
  saveJob,
  isJobNew,
  saveLead,
  saveOutreach,
  markAsSent,
  markAsFailed
};
```

#### 6.2 Dashboard (Optional)

```txt
File: dashboard/src/App.jsx
Tech:  Vite + React + Supabase JS Client
Deploy: Vercel (Free)

Views:
  1. "Today's Sends"  → List of emails sent in last 24h
  2. "Pipeline"       → Jobs scraped but email not sent yet
  3. "Replies"        → Manually mark which leads replied
  4. "Stats"          → Total sent, reply rate, companies targeted

NOTE: For the first 30 days, use Supabase's built-in
Table Editor as your dashboard. Build the React
dashboard only after the pipeline is stable.
```

---

## 6. GitHub Actions Config

```yaml
# File: .github/workflows/daily-outreach.yml

name: Daily Job Outreach Pipeline

on:
  schedule:
    - cron: '30 3 * * 1-5'   # 9:00 AM IST, Monday to Friday only
  workflow_dispatch:           # Manual trigger from GitHub UI anytime

jobs:
  run-pipeline:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install Dependencies
        run: npm install

      - name: Install Playwright Browsers
        run: npx playwright install chromium

      - name: Run Pipeline
        env:
          LINKEDIN_COOKIE:    ${{ secrets.LINKEDIN_COOKIE }}
          APOLLO_API_KEY:     ${{ secrets.APOLLO_API_KEY }}
          ANTHROPIC_API_KEY:  ${{ secrets.ANTHROPIC_API_KEY }}
          SUPABASE_URL:       ${{ secrets.SUPABASE_URL }}
          SUPABASE_KEY:       ${{ secrets.SUPABASE_KEY }}
          GMAIL_USER:         ${{ secrets.GMAIL_USER }}
          GMAIL_APP_PASSWORD: ${{ secrets.GMAIL_APP_PASSWORD }}
        run: node src/index.js

      - name: Notify on Failure
        if: failure()
        run: |
          curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
          -d '{"text": "Job Outreach Pipeline FAILED. Check GitHub Actions logs."}'
```

---

## 7. Project Folder Structure

```txt
job-outreach-bot/
├── .github/
│   └── workflows/
│       └── daily-outreach.yml
├── src/
│   ├── index.js                  ← Master orchestrator
│   ├── scrapers/
│   │   ├── linkedin.js           ← LinkedIn Playwright scraper
│   │   └── naukri.js             ← Naukri Playwright scraper
│   ├── enrichment/
│   │   ├── apollo.js             ← Manager email lookup
│   │   └── emailGuesser.js       ← Fallback email pattern guesser
│   ├── generator/
│   │   └── emailGenerator.js     ← Claude API call + response parser
│   ├── sender/
│   │   └── emailSender.js        ← Nodemailer + daily limit guard
│   ├── db/
│   │   └── supabase.js           ← All database operations
│   ├── context/
│   │   └── resume.js             ← Your resume as a JS object
│   └── prompts/
│       └── emailPrompt.js        ← Prompt template builder
├── dashboard/
│   └── src/
│       └── App.jsx               ← Optional React tracking UI
├── .env.example                  ← Template for all secrets
├── package.json
└── README.md
```

---

## 8. Master Orchestrator

```javascript
// File: src/index.js

const { scrapeLinkedIn } = require('./scrapers/linkedin');
const { scrapeNaukri } = require('./scrapers/naukri');
const { generateEmail } = require('./generator/emailGenerator');
const { sendEmail } = require('./sender/emailSender');
const { findManager } = require('./enrichment/apollo');
const {
  saveJob,
  isJobNew,
  saveLead,
  saveOutreach,
  getDailySentCount,
  markAsSent,
  markAsFailed
} = require('./db/supabase');

const DAILY_LIMIT = 15;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

async function main() {
  console.log('Pipeline started:', new Date().toISOString());

  // STEP 1: Check daily limit before doing any work
  const sentToday = await getDailySentCount();
  if (sentToday >= DAILY_LIMIT) {
    console.log(`Daily limit of ${DAILY_LIMIT} already reached. Exiting.`);
    process.exit(0);
  }

  let remainingQuota = DAILY_LIMIT - sentToday;
  console.log(`Remaining quota for today: ${remainingQuota}`);

  // STEP 2: Scrape jobs from all sources in parallel
  const [linkedinJobs, naukriJobs] = await Promise.all([
    scrapeLinkedIn(),
    scrapeNaukri()
  ]);

  const allJobs = [...linkedinJobs, ...naukriJobs];
  console.log(`Total scraped: ${allJobs.length} jobs`);

  // STEP 3: Process each job
  for (const job of allJobs) {
    if (remainingQuota <= 0) {
      console.log('Quota exhausted. Stopping pipeline.');
      break;
    }

    try {
      // STEP 3a: Deduplication check
      const isNew = await isJobNew(job.jobId);
      if (!isNew) {
        console.log(`Duplicate job skipped: ${job.jobId}`);
        continue;
      }

      // STEP 3b: Save new job to DB
      await saveJob({
        job_id: job.jobId,
        title: job.title,
        company_name: job.companyName,
        company_domain: job.companyDomain,
        job_url: job.jobUrl,
        job_description: job.jobDescription,
        source: job.source,
        posted_at: job.postedAt
      });

      // STEP 3c: Find hiring manager
      const manager = await findManager(job.companyDomain);
      if (!manager || !manager.email) {
        console.log(`No manager found for: ${job.companyName}. Skipping.`);
        continue;
      }

      // STEP 3d: Save lead
      const lead = await saveLead({
        job_id: job.jobId,
        manager_name: manager.name,
        manager_title: manager.title,
        manager_email: manager.email,
        linkedin_url: manager.linkedin,
        email_verified: manager.confidence === 'high',
        apollo_confidence: manager.confidence
      });

      // STEP 3e: Generate personalized email
      const { subject, body } = await generateEmail(
        job.jobDescription,
        manager.name,
        job.companyName
      );

      // STEP 3f: Save draft to outreach table
      const outreach = await saveOutreach({
        lead_id: lead.id,
        job_id: job.jobId,
        subject_line: subject,
        email_body: body,
        status: 'pending'
      });

      // STEP 3g: Send the email
      const result = await sendEmail(manager.email, subject, body);

      if (result.success) {
        await markAsSent(outreach.id);
        remainingQuota--;
        console.log(`✓ Email sent → ${manager.name} at ${job.companyName}`);
      } else {
        await markAsFailed(outreach.id, result.error || result.reason);
        console.log(`✗ Failed → ${job.companyName}: ${result.error}`);
      }

      // STEP 3h: Human-like delay between sends (30-90 seconds)
      const delay = randomDelay(30000, 90000);
      console.log(`Waiting ${Math.round(delay / 1000)}s before next send...`);
      await sleep(delay);

    } catch (error) {
      console.error(`Error processing ${job.companyName}:`, error.message);
      continue;
    }
  }

  console.log('Pipeline completed:', new Date().toISOString());
}

main().catch(console.error);
```

---

## 9. Environment Variables

```bash
# File: .env.example
# Copy this to .env for local development
# Add all values to GitHub Secrets for production

# LinkedIn (get this from browser DevTools → Application → Cookies → li_at)
LINKEDIN_COOKIE=your_linkedin_li_at_cookie_value

# Apollo.io (from apollo.io → Settings → Integrations → API Keys)
APOLLO_API_KEY=your_apollo_api_key

# Anthropic Claude API (from console.anthropic.com → API Keys)
# NOTE: This is different from your Claude.ai subscription
ANTHROPIC_API_KEY=your_anthropic_api_key

# Supabase (from supabase.com → Project Settings → API)
SUPABASE_URL=https://yourproject.supabase.co
SUPABASE_KEY=your_supabase_anon_key

# Gmail (new job-hunting email + App Password)
GMAIL_USER=yourname.jobs@gmail.com
GMAIL_APP_PASSWORD=your_16_char_app_password

# Optional: Slack webhook for failure alerts
SLACK_WEBHOOK=your_slack_webhook_url

# Optional: Hunter.io for fallback email verification
HUNTER_API_KEY=your_hunter_free_key
```

---

## 10. Implementation Phases

### Phase 1: Foundation (Day 1–2)

- Create private GitHub repository
- Set up Supabase project and run all 3 SQL schema scripts
- Create new Gmail account (`yourname.jobs@gmail.com`)
- Enable 2FA and generate Gmail App Password
- Sign up for Apollo.io free tier and get API key
- Add $5 credits to `console.anthropic.com` (separate from Claude.ai sub)
- Add all keys to GitHub Secrets
- Create `.env` file locally from `.env.example`

### Phase 2: Build Scrapers (Day 3–4)

- Build LinkedIn scraper with Playwright + stealth plugin
- Build Naukri scraper with Playwright
- Test both scrapers locally with `node src/scrapers/linkedin.js`
- Confirm scraped data is saving correctly to Supabase `jobs` table
- Verify deduplication logic works on second run

### Phase 3: Build Enrichment (Day 5)

- Build Apollo.io manager lookup module
- Build email pattern guesser fallback
- Test with 5 known companies (e.g., Razorpay, Zepto, Swiggy)
- Confirm manager emails are being saved to `leads` table

### Phase 4: Build Generator + Sender (Day 6)

- Fill in your actual data in `src/context/resume.js`
- Test Claude API call and print output to console
- Review 5 generated emails manually for quality
- Adjust prompt rules if tone/length is off
- Build Nodemailer sender
- Send 3 test emails to your own personal accounts

### Phase 5: Email Warmup (Day 7–10)

- Run warmup manually: send 5 emails/day to your own accounts
- Reply to those emails from the receiving account
- Do NOT run the main cold email pipeline yet
- Gradually increase to 15/day by Day 10

### Phase 6: Go Live (Day 11)

- Enable GitHub Actions cron job
- Trigger first run manually via `workflow_dispatch`
- Monitor GitHub Actions logs in real time
- Check Supabase tables for correct data flow
- Verify first 3 emails landed in inbox (not spam)

### Phase 7: Optimize (Day 20–30)

- Review reply rates in Supabase dashboard
- A/B test subject lines by changing the prompt weekly
- Add follow-up email logic (send bump email after 3 days of no reply)
- Consider adding more job sources (Wellfound, Instahyre)

---

## 11. Risk Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| LinkedIn blocks scraper IP | High | Stealth plugin + random delays + rotate LinkedIn cookies monthly |
| Gmail flags account as spam | High | Warmup period + 15/day hard limit + plain text emails |
| Apollo free credits exhausted | Medium | Email guesser fallback + Hunter.io backup |
| Claude API costs spike | Low | Set `max_tokens: 500` + billing alert on Anthropic console |
| Wrong manager targeted | Medium | Filter Apollo strictly for Engineering titles only |
| Duplicate emails sent to same person | High | Unique `job_id` constraint in DB + check `leads` table before inserting |
| GitHub Actions timeout | Low | Set `timeout-minutes: 30` in workflow config |

---

## 12. Estimated Monthly Cost

| Item | Cost |
|---|---|
| GitHub Actions | $0 |
| Supabase (Free Tier) | $0 |
| Apollo.io (Free Tier) | $0 |
| Playwright (Open Source) | $0 |
| Nodemailer (Open Source) | $0 |
| Gmail (New Account) | $0 |
| Anthropic API Credits | ~$2–5 |
| Webshare Proxy (Optional) | $0–10 |
| **Total** | **$2–15/month** |

---

## 13. Follow-Up Email Logic (Phase 7 Addition)

If a lead does not reply within 3 days, send one follow-up bump email.

```sql
-- Query to find leads needing a follow-up
SELECT o.id, o.lead_id, o.job_id, l.manager_email, l.manager_name
FROM outreach o
JOIN leads l ON o.lead_id = l.id
WHERE o.status = 'sent'
  AND o.reply_received = FALSE
  AND o.follow_up_count = 0
  AND o.sent_at < NOW() - INTERVAL '3 days';
```

Follow-up email template:

```txt
Subject: Re: [Original Subject Line]

Hi [Name],

Just floating this back to the top in case it got buried.

Still happy to do a quick 15-min chat if the timing works.

[Your Name]
Resume: [URL] | Portfolio: [URL]
```

---

This PRD is implementation-ready. Feed it module by module to Claude or any LLM. Start with Phase 1. Build and test each module in isolation before connecting them. The master orchestrator (`src/index.js`) should be the last thing you wire together.
