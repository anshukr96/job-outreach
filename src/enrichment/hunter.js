require('dotenv').config();
const axios = require('axios');

const ENGINEERING_TITLES = [
  'engineering manager', 'vp engineering', 'head of engineering',
  'cto', 'director of engineering', 'tech lead', 'lead engineer',
  'principal engineer', 'vp of engineering'
];

function scoreEmail(email) {
  const pos = (email.position || '').toLowerCase();
  const sen = (email.seniority || '').toLowerCase();

  // Prefer senior engineering leadership
  const titleMatch = ENGINEERING_TITLES.findIndex(t => pos.includes(t));
  const titleScore = titleMatch === -1 ? 99 : titleMatch;
  const seniorityScore = ['executive', 'senior'].includes(sen) ? 0 : 1;

  return titleScore * 10 + seniorityScore;
}

async function findManagerViaHunter(domain) {
  if (!process.env.HUNTER_API_KEY) return null;

  try {
    const { data } = await axios.get('https://api.hunter.io/v2/domain-search', {
      params: {
        domain,
        department: 'engineering',
        api_key: process.env.HUNTER_API_KEY,
        limit: 10
      },
      timeout: 10000
    });

    const emails = data?.data?.emails || [];
    if (!emails.length) return null;

    // Pick the best match based on title seniority
    const best = emails
      .filter(e => e.value && e.first_name)
      .sort((a, b) => scoreEmail(a) - scoreEmail(b))[0];

    if (!best) return null;

    return {
      name: [best.first_name, best.last_name].filter(Boolean).join(' '),
      firstName: best.first_name,
      lastName: best.last_name,
      email: best.value,
      title: best.position || '',
      linkedin: best.linkedin || null,
      confidence: best.confidence >= 80 ? 'high' : best.confidence >= 50 ? 'medium' : 'low'
    };
  } catch (err) {
    console.warn(`[hunter] domain search failed for ${domain}: ${err.message}`);
    return null;
  }
}

module.exports = { findManagerViaHunter };
