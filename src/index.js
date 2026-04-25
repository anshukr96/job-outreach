// File: src/index.js
// Master orchestrator. Wires every module together end-to-end:
// scrape -> dedupe -> enrich -> generate -> send -> track.

require('dotenv').config();

const { scrapeLinkedIn } = require('./scrapers/linkedin');
const { scrapeNaukri } = require('./scrapers/naukri');
const { findManager } = require('./enrichment/apollo');
const { generateEmail } = require('./generator/emailGenerator');
const { sendEmail, DAILY_LIMIT } = require('./sender/emailSender');
const {
  saveJob,
  isJobNew,
  saveLead,
  leadAlreadyContacted,
  saveOutreach,
  getDailySentCount,
  markAsSent,
  markAsFailed
} = require('./db/supabase');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

async function safeScrape(name, fn) {
  try {
    return await fn();
  } catch (err) {
    console.error(`[orchestrator] ${name} scraper failed: ${err.message}`);
    return [];
  }
}

async function main() {
  console.log('Pipeline started:', new Date().toISOString());

  // STEP 1: daily-limit guard
  const sentToday = await getDailySentCount();
  if (sentToday >= DAILY_LIMIT) {
    console.log(`Daily limit of ${DAILY_LIMIT} already reached. Exiting.`);
    process.exit(0);
  }
  let remainingQuota = DAILY_LIMIT - sentToday;
  console.log(`Remaining quota for today: ${remainingQuota}`);

  // STEP 2: scrape sources in parallel — one source failing must not kill the run.
  const [linkedinJobs, naukriJobs] = await Promise.all([
    safeScrape('linkedin', scrapeLinkedIn),
    safeScrape('naukri', scrapeNaukri)
  ]);
  const allJobs = [...linkedinJobs, ...naukriJobs];
  console.log(`Total scraped: ${allJobs.length} jobs`);

  // STEP 3: per-job pipeline
  for (const job of allJobs) {
    if (remainingQuota <= 0) {
      console.log('Quota exhausted. Stopping pipeline.');
      break;
    }

    try {
      // 3a: dedupe
      const isNew = await isJobNew(job.jobId);
      if (!isNew) {
        console.log(`Duplicate job skipped: ${job.jobId}`);
        continue;
      }

      // 3b: persist job
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

      // 3c: hiring manager lookup
      if (!job.companyDomain) {
        console.log(`No domain for ${job.companyName}. Skipping enrichment.`);
        continue;
      }
      const manager = await findManager(job.companyDomain);
      if (!manager || !manager.email) {
        console.log(`No manager found for: ${job.companyName}. Skipping.`);
        continue;
      }

      // 3c-bis: don't double-contact the same person across roles
      if (await leadAlreadyContacted(manager.email)) {
        console.log(`Already contacted ${manager.email}. Skipping.`);
        continue;
      }

      // 3d: persist lead
      const lead = await saveLead({
        job_id: job.jobId,
        manager_name: manager.name,
        manager_title: manager.title,
        manager_email: manager.email,
        linkedin_url: manager.linkedin,
        email_verified: manager.confidence === 'high',
        apollo_confidence: manager.confidence
      });

      // 3e: generate email
      const { subject, body } = await generateEmail(
        job.jobDescription,
        manager.name,
        job.companyName
      );

      // 3f: persist draft
      const outreach = await saveOutreach({
        lead_id: lead.id,
        job_id: job.jobId,
        subject_line: subject,
        email_body: body,
        status: 'pending'
      });

      // 3g: send
      const result = await sendEmail(manager.email, subject, body);
      if (result.success) {
        await markAsSent(outreach.id);
        remainingQuota--;
        console.log(`Email sent -> ${manager.name} at ${job.companyName}`);
      } else {
        await markAsFailed(outreach.id, result.error || result.reason);
        console.log(`Failed -> ${job.companyName}: ${result.error || result.reason}`);
        // If we hit the daily limit mid-run, stop the loop entirely.
        if (result.reason === 'daily_limit_reached') break;
      }

      // 3h: human-like delay between sends
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

if (require.main === module) {
  main().catch(err => {
    console.error('Pipeline crashed:', err);
    process.exit(1);
  });
}

module.exports = { main };
