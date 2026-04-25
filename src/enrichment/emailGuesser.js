// File: src/enrichment/emailGuesser.js
// Fallback email finder. Generates common patterns from a person's
// first/last name + company domain, then validates each via Hunter.io.

require('dotenv').config();
const axios = require('axios');

function buildCandidates(firstName, lastName, domain) {
  const f = (firstName || '').toLowerCase().replace(/[^a-z]/g, '');
  const l = (lastName || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!f || !domain) return [];

  const candidates = new Set();
  if (f) candidates.add(`${f}@${domain}`);
  if (f && l) {
    candidates.add(`${f}.${l}@${domain}`);
    candidates.add(`${f[0]}.${l}@${domain}`);
    candidates.add(`${f}${l}@${domain}`);
    candidates.add(`${f[0]}${l}@${domain}`);
    candidates.add(`${l}.${f}@${domain}`);
  }
  return Array.from(candidates);
}

async function verifyWithHunter(email) {
  if (!process.env.HUNTER_API_KEY) return null;
  try {
    const { data } = await axios.get(
      'https://api.hunter.io/v2/email-verifier',
      {
        params: { email, api_key: process.env.HUNTER_API_KEY },
        timeout: 10000
      }
    );
    const status = data?.data?.status;
    // Hunter buckets statuses; "valid" is what we trust to send.
    return status === 'valid' ? email : null;
  } catch (err) {
    console.warn(`[guesser] Hunter check failed for ${email}: ${err.message}`);
    return null;
  }
}

/**
 * Returns the first candidate Hunter.io marks as valid, or null.
 */
async function guessEmail(firstName, lastName, domain) {
  const candidates = buildCandidates(firstName, lastName, domain);
  if (candidates.length === 0) return null;

  if (!process.env.HUNTER_API_KEY) {
    // Without Hunter we can't verify — return the most common pattern
    // as a low-confidence guess (caller's responsibility to flag).
    return candidates[1] || candidates[0];
  }

  for (const email of candidates) {
    const verified = await verifyWithHunter(email);
    if (verified) return verified;
  }
  return null;
}

module.exports = { buildCandidates, guessEmail };
