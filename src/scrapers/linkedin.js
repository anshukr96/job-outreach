// File: src/scrapers/linkedin.js
// Scrapes LinkedIn job postings using Playwright + stealth plugin.
// Uses a saved li_at cookie instead of logging in every run.

require('dotenv').config();
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

chromium.use(stealth);

const KEYWORDS = process.env.SEARCH_KEYWORDS || 'Senior Frontend Engineer';
const MAX_JOBS = parseInt(process.env.LINKEDIN_MAX_JOBS || '50', 10);
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Best-effort domain extraction from a LinkedIn company URL.
 * LinkedIn doesn't expose the actual website domain on every card,
 * so we fall back to a slug-based guess that downstream enrichment
 * can refine via Apollo / Clearbit.
 */
function deriveDomainFromCompany(name) {
  if (!name) return null;
  const slug = name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
  return slug ? `${slug}.com` : null;
}

async function scrapeLinkedIn() {
  if (!process.env.LINKEDIN_COOKIE) {
    console.warn('[linkedin] LINKEDIN_COOKIE missing. Skipping LinkedIn scrape.');
    return [];
  }

  const browser = await chromium.launch({
    headless: true,
    slowMo: 1500
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    userAgent: USER_AGENT
  });

  // Inject the saved session cookie so we don't have to log in.
  await context.addCookies([
    {
      name: 'li_at',
      value: process.env.LINKEDIN_COOKIE,
      domain: '.linkedin.com',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'None'
    }
  ]);

  const page = await context.newPage();
  const searchUrl =
    `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(KEYWORDS)}` +
    `&f_TPR=r86400&location=${encodeURIComponent(process.env.SEARCH_LOCATION || 'India')}`;

  console.log(`[linkedin] Navigating to ${searchUrl}`);
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(randomDelay(3000, 6000));

  await page.screenshot({ path: 'linkedin-debug.png', fullPage: false });
  const pageTitle = await page.title();
  console.log(`[linkedin] Page title: "${pageTitle}"`);
  const bodyText = await page.locator('body').innerText().catch(() => '');
  console.log(`[linkedin] Body preview: ${bodyText.slice(0, 300)}`);

  // Infinite-scroll handler — scroll the job results pane until no new
  // cards appear or we hit MAX_JOBS.
  let previousCount = 0;
  for (let i = 0; i < 25; i++) {
    await page.mouse.wheel(0, 4000);
    await sleep(randomDelay(1200, 2500));
    const count = await page.locator('div.job-card-container, li.jobs-search-results__list-item').count();
    if (count === previousCount || count >= MAX_JOBS) break;
    previousCount = count;
  }

  // Extract the card-level metadata first; we'll fetch full JD per card next.
  const cards = await page.evaluate((max) => {
    const out = [];
    const nodes = document.querySelectorAll('div.job-card-container, li.jobs-search-results__list-item');
    nodes.forEach((el, idx) => {
      if (idx >= max) return;
      const link = el.querySelector('a.job-card-list__title, a.job-card-container__link');
      const titleEl = el.querySelector('.job-card-list__title, .job-card-container__link');
      const companyEl =
        el.querySelector('.job-card-container__primary-description, .job-card-container__company-name');
      const href = link?.href || '';
      const idMatch = href.match(/jobs\/view\/(\d+)/);
      out.push({
        jobId: idMatch ? idMatch[1] : null,
        title: titleEl?.innerText?.trim() || '',
        companyName: companyEl?.innerText?.trim() || '',
        jobUrl: href.split('?')[0] || ''
      });
    });
    return out.filter(j => j.jobId && j.title && j.companyName);
  }, MAX_JOBS);

  console.log(`[linkedin] Found ${cards.length} cards. Fetching JDs...`);

  const results = [];
  for (const card of cards) {
    try {
      await page.goto(card.jobUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(randomDelay(3000, 8000));

      // Click "see more" if present so the full JD renders.
      const seeMore = page.locator('button.show-more-less-html__button, button[aria-label="See more"]');
      if (await seeMore.first().isVisible().catch(() => false)) {
        await seeMore.first().click().catch(() => {});
        await sleep(800);
      }

      const description = await page
        .locator('div.jobs-description__content, div.show-more-less-html__markup, div.description__text')
        .first()
        .innerText()
        .catch(() => '');

      results.push({
        jobId: `linkedin-${card.jobId}`,
        title: card.title,
        companyName: card.companyName,
        companyDomain: deriveDomainFromCompany(card.companyName),
        jobUrl: card.jobUrl,
        jobDescription: description.trim(),
        source: 'linkedin',
        postedAt: new Date().toISOString()
      });
    } catch (err) {
      console.warn(`[linkedin] Failed JD fetch for ${card.companyName}: ${err.message}`);
    }
  }

  await browser.close();
  console.log(`[linkedin] Returning ${results.length} jobs.`);
  return results;
}

module.exports = { scrapeLinkedIn };

// Allow running this file directly for quick debugging:
//   node src/scrapers/linkedin.js
if (require.main === module) {
  scrapeLinkedIn()
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
