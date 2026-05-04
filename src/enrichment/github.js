require('dotenv').config();
const axios = require('axios');
const { buildCandidates } = require('./emailGuesser');

const SENIOR_KEYWORDS = [
  'engineering manager', 'vp', 'head of engineering', 'cto',
  'director', 'tech lead', 'principal', 'staff engineer', 'lead engineer'
];

function isSeniorEngineer(user) {
  const bio = (user.bio || '').toLowerCase();
  const name = (user.name || '').toLowerCase();
  return SENIOR_KEYWORDS.some(k => bio.includes(k) || name.includes(k));
}

function buildHeaders() {
  const headers = { 'Accept': 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function searchGitHubUsers(companyName) {
  // Most people mention company in bio, not the company field
  const slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const queries = [
    `${companyName} in:bio type:user`,
    `${slug} in:bio type:user`
  ];

  for (const q of queries) {
    try {
      const { data } = await axios.get('https://api.github.com/search/users', {
        params: { q, per_page: 30, sort: 'followers' },
        headers: buildHeaders(),
        timeout: 10000
      });
      if (data?.items?.length) return data.items;
    } catch (err) {
      if (err.response?.status === 403) {
        console.warn('[github] Rate limit hit. Add GITHUB_TOKEN to .env for higher limits.');
      } else {
        console.warn(`[github] search failed: ${err.message}`);
      }
    }
  }
  return [];
}

async function getUserDetails(login) {
  try {
    const { data } = await axios.get(`https://api.github.com/users/${login}`, {
      headers: buildHeaders(),
      timeout: 10000
    });
    return data;
  } catch {
    return null;
  }
}

async function findManagerViaGitHub(companyName, domain) {
  const items = await searchGitHubUsers(companyName);
  if (!items.length) return null;

  // Fetch details for top candidates (max 5 to save rate limit)
  const candidates = [];
  for (const item of items.slice(0, 5)) {
    const user = await getUserDetails(item.login);
    if (!user) continue;
    candidates.push(user);
  }

  // Prefer senior engineers with public emails
  const withEmail = candidates.filter(u => u.email && isSeniorEngineer(u));
  const withoutEmail = candidates.filter(u => !u.email && isSeniorEngineer(u));
  const fallbacks = candidates.filter(u => !isSeniorEngineer(u));

  const ranked = [...withEmail, ...withoutEmail, ...fallbacks];
  if (!ranked.length) return null;

  const best = ranked[0];
  const nameParts = (best.name || best.login || '').split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  // Use public email if available, otherwise use most common pattern (no verification needed
  // since we already confirmed the person works there via GitHub bio)
  let email = best.email || null;
  if (!email && firstName && domain) {
    const candidates = buildCandidates(firstName, lastName, domain);
    email = candidates[1] || candidates[0] || null; // firstname.lastname@ is most common
  }

  if (!email) return null;

  console.log(`[github] Found: ${best.name} (${best.login})`);
  return {
    name: best.name || best.login,
    firstName,
    lastName,
    email,
    title: best.bio || '',
    linkedin: null,
    confidence: best.email ? 'medium' : 'low'
  };
}

module.exports = { findManagerViaGitHub };
