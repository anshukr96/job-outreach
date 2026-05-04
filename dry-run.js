require('dotenv').config();
const results = [];

function pass(label) { results.push({ label, ok: true }); }
function fail(label, err) { results.push({ label, ok: false, err }); }

async function checkModules() {
  try {
    require('./src/db/supabase');
    require('./src/sender/emailSender');
    require('./src/generator/emailGenerator');
    require('./src/enrichment/apollo');
    require('./src/enrichment/emailGuesser');
    require('./src/context/resume');
    pass('Module loading');
  } catch (e) {
    fail('Module loading', e.message);
  }
}

async function checkEnvVars() {
  const required = [
    'SUPABASE_URL', 'SUPABASE_KEY',
    'ANTHROPIC_API_KEY',
    'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'SENDER_NAME',
    'LINKEDIN_COOKIE', 'APOLLO_API_KEY'
  ];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) fail('Env vars', `Missing: ${missing.join(', ')}`);
  else pass('Env vars');
}

async function checkSupabase() {
  try {
    const { getDailySentCount } = require('./src/db/supabase');
    const count = await getDailySentCount();
    pass(`Supabase connection (sent today: ${count})`);
  } catch (e) {
    fail('Supabase connection', e.message);
  }
}

async function checkGmail() {
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });
    await transporter.verify();
    pass('Gmail SMTP');
  } catch (e) {
    fail('Gmail SMTP', e.message);
  }
}

async function checkAnthropic() {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'say ok' }]
    });
    pass(`Anthropic API (model: ${msg.model})`);
  } catch (e) {
    fail('Anthropic API', e.message);
  }
}

async function checkApollo() {
  try {
    if (!process.env.APOLLO_API_KEY) throw new Error('APOLLO_API_KEY not set');
    const axios = require('axios');
    const { data } = await axios.post(
      'https://api.apollo.io/v1/people/match',
      { organization_domain: 'razorpay.com', title: ['Engineering Manager'], per_page: 1 },
      { headers: { 'X-Api-Key': process.env.APOLLO_API_KEY }, timeout: 15000 }
    );
    const found = data?.person ? `found: ${data.person.first_name} ${data.person.last_name}` : 'no person returned';
    pass(`Apollo API (${found})`);
  } catch (e) {
    fail('Apollo API (paid plan required — GitHub fallback is active)', e.message);
  }
}

async function checkGitHub() {
  try {
    const { findManagerViaGitHub } = require('./src/enrichment/github');
    const result = await findManagerViaGitHub('razorpay', 'razorpay.com');
    if (result?.email) pass(`GitHub enrichment fallback (found: ${result.name} → ${result.email})`);
    else fail('GitHub enrichment fallback', 'no result for razorpay.com');
  } catch (e) {
    fail('GitHub enrichment fallback', e.message);
  }
}

async function checkResumePlaceholders() {
  const resume = require('./src/context/resume');
  const placeholders = [];
  if (resume.name === 'Your Name') placeholders.push('name');
  if (resume.portfolioUrl === 'https://yourportfolio.com') placeholders.push('portfolioUrl');
  if (resume.resumeUrl === 'https://drive.google.com/your-resume-link') placeholders.push('resumeUrl');
  if (placeholders.length) fail('Resume data', `Still has placeholders: ${placeholders.join(', ')}`);
  else pass('Resume data');
}

async function main() {
  console.log('Running dry-run checks...\n');
  await checkEnvVars();
  await checkModules();
  await checkSupabase();
  await checkGmail();
  await checkAnthropic();
  await checkApollo();
  await checkGitHub();
  await checkResumePlaceholders();

  console.log('\nResults:');
  let allPassed = true;
  for (const r of results) {
    if (r.ok) {
      console.log(`  ✅ ${r.label}`);
    } else {
      console.log(`  ❌ ${r.label}: ${r.err}`);
      allPassed = false;
    }
  }
  console.log(allPassed ? '\nAll checks passed — pipeline is ready.' : '\nFix the issues above before running.');
  process.exit(allPassed ? 0 : 1);
}

main();
