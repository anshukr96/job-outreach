// File: src/enrichment/apollo.js
// Looks up the most likely hiring manager at a company using Apollo.io's
// people/match endpoint. Falls back through a list of titles before giving up.

require('dotenv').config();
const axios = require('axios');
const { guessEmail } = require('./emailGuesser');
const { findManagerViaHunter } = require('./hunter');
const { findManagerViaGitHub } = require('./github');

const APOLLO_URL = 'https://api.apollo.io/v1/people/match';

const PRIMARY_TITLES = [
  'Engineering Manager',
  'VP Engineering',
  'Head of Engineering',
  'CTO',
  'Director of Engineering'
];

const FALLBACK_TITLES = ['Tech Lead', 'Lead Engineer', 'Principal Engineer'];

function mapConfidence(emailStatus) {
  // Apollo returns email_status: "verified" | "guessed" | "unverified" | "bounced"
  if (emailStatus === 'verified') return 'high';
  if (emailStatus === 'guessed') return 'medium';
  return 'low';
}

async function callApollo(domain, titles) {
  if (!process.env.APOLLO_API_KEY) {
    console.warn('[apollo] APOLLO_API_KEY missing.');
    return null;
  }
  try {
    const { data } = await axios.post(
      APOLLO_URL,
      {
        organization_domain: domain,
        title: titles,
        page: 1,
        per_page: 1
      },
      {
        headers: {
          'X-Api-Key': process.env.APOLLO_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    const person = data?.person;
    if (!person || !person.email) return null;

    return {
      name: [person.first_name, person.last_name].filter(Boolean).join(' '),
      firstName: person.first_name,
      lastName: person.last_name,
      email: person.email,
      title: person.title,
      linkedin: person.linkedin_url || null,
      confidence: mapConfidence(person.email_status)
    };
  } catch (err) {
    console.warn(`[apollo] lookup failed for ${domain}: ${err.message}`);
    return null;
  }
}

/**
 * Find the most likely hiring manager for a given company domain.
 * Tries primary titles, then fallback titles, then the email-guesser.
 */
async function findManager(domain) {
  if (!domain) return null;

  let manager = await callApollo(domain, PRIMARY_TITLES);
  if (manager?.email) return manager;

  manager = await callApollo(domain, FALLBACK_TITLES);
  if (manager?.email) return manager;

  // Fallback 1: Hunter.io domain search (free, 25/month, needs professional email to signup)
  const hunterResult = await findManagerViaHunter(domain);
  if (hunterResult?.email) {
    console.log(`[enrichment] Found via Hunter.io: ${hunterResult.name}`);
    return hunterResult;
  }

  // Fallback 2: GitHub user search (free, no signup needed)
  const companyName = domain.replace(/\.(com|in|io|co)$/, '');
  const githubResult = await findManagerViaGitHub(companyName, domain);
  if (githubResult?.email) {
    console.log(`[enrichment] Found via GitHub: ${githubResult.name}`);
    return githubResult;
  }

  // Fallback 3: guess email from name + domain
  const nameOnly = await callApollo(domain, [...PRIMARY_TITLES, ...FALLBACK_TITLES]);
  if (nameOnly?.firstName && nameOnly?.lastName) {
    const guessed = await guessEmail(nameOnly.firstName, nameOnly.lastName, domain);
    if (guessed) {
      return { ...nameOnly, email: guessed, confidence: 'low' };
    }
  }

  return null;
}

module.exports = { findManager };

if (require.main === module) {
  const domain = process.argv[2] || 'razorpay.com';
  findManager(domain).then(m => {
    console.log(JSON.stringify(m, null, 2));
    process.exit(0);
  });
}
