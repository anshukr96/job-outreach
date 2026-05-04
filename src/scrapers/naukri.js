// File: src/scrapers/naukri.js
require('dotenv').config();
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const axios = require('axios');

chromium.use(stealth);

const BASE_URL =
  process.env.NAUKRI_URL ||
  'https://www.naukri.com/senior-frontend-developer-jobs?k=senior%20frontend%20developer&jobAge=1';

const MAX_JOBS = parseInt(process.env.NAUKRI_MAX_JOBS || '30', 10);
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function slugifyCompany(name) {
  return (name || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Verify a candidate domain via Clearbit's free Logo API.
 * Returns the domain if it resolves, otherwise null.
 */
async function verifyDomain(domain) {
  if (!domain) return null;
  try {
    const res = await axios.get(`https://logo.clearbit.com/${domain}`, {
      timeout: 5000,
      validateStatus: s => s < 500
    });
    return res.status === 200 ? domain : null;
  } catch {
    return null;
  }
}

async function resolveCompanyDomain(name) {
  const slug = slugifyCompany(name);
  if (!slug) return null;
  // Try .com first, then .in (common for Indian companies on Naukri).
  return (await verifyDomain(`${slug}.com`)) || (await verifyDomain(`${slug}.in`));
}

async function scrapeNaukri() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    userAgent: USER_AGENT
  });
  const page = await context.newPage();

  console.log(`[naukri] Navigating to ${BASE_URL}`);
  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (err) {
    console.warn(`[naukri] navigation failed: ${err.message}`);
    await browser.close();
    return [];
  }

  await sleep(randomDelay(3000, 6000));

  await page.screenshot({ path: 'naukri-debug.png', fullPage: false });
  const pageTitle = await page.title();
  console.log(`[naukri] Page title: "${pageTitle}"`);
  const bodyText = await page.locator('body').innerText().catch(() => '');
  console.log(`[naukri] Body preview: ${bodyText.slice(0, 300)}`);

  // Cards on Naukri's SRP — selectors change occasionally; the article element
  // tends to be the most stable container.
  const cards = await page.evaluate((max) => {
    const out = [];
    const nodes = document.querySelectorAll('article.jobTuple, div.srp-jobtuple-wrapper');
    nodes.forEach((el, idx) => {
      if (idx >= max) return;
      const titleEl = el.querySelector('a.title, a.jobTitle');
      const companyEl = el.querySelector('a.subTitle, a.comp-name');
      const id = el.getAttribute('data-job-id') || titleEl?.href?.match(/(\d+)$/)?.[1] || null;
      const postedEl = el.querySelector('span.job-post-day, span.fleft.postedDate');
      out.push({
        jobId: id,
        title: titleEl?.innerText?.trim() || '',
        companyName: companyEl?.innerText?.trim() || '',
        jobUrl: titleEl?.href || '',
        postedText: postedEl?.innerText?.trim() || ''
      });
    });
    return out.filter(j => j.jobId && j.title && j.companyName);
  }, MAX_JOBS);

  console.log(`[naukri] Found ${cards.length} cards. Fetching JDs...`);

  const results = [];
  for (const card of cards) {
    try {
      await page.goto(card.jobUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(randomDelay(2000, 5000));

      const description = await page
        .locator('section.job-desc, div.styles_JDC__dang-inner-html__h0K4t, div.jd-desc')
        .first()
        .innerText()
        .catch(() => '');

      const domain = await resolveCompanyDomain(card.companyName);

      results.push({
        jobId: `naukri-${card.jobId}`,
        title: card.title,
        companyName: card.companyName,
        companyDomain: domain,
        jobUrl: card.jobUrl,
        jobDescription: description.trim(),
        source: 'naukri',
        postedAt: new Date().toISOString()
      });
    } catch (err) {
      console.warn(`[naukri] Failed JD fetch for ${card.companyName}: ${err.message}`);
    }
  }

  await browser.close();
  console.log(`[naukri] Returning ${results.length} jobs.`);
  return results;
}

module.exports = { scrapeNaukri };

if (require.main === module) {
  scrapeNaukri()
    .then(jobs => {
      console.log(JSON.stringify(jobs.slice(0, 3), null, 2));
      console.log(`Total: ${jobs.length}`);
      process.exit(0);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
