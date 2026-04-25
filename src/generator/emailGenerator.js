// File: src/generator/emailGenerator.js
// Calls Claude to generate a personalized cold email subject + body.

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { generatePrompt } = require('../prompts/emailPrompt');
const MY_RESUME = require('../context/resume');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';

/**
 * Strips ```json ... ``` fences if Claude wraps the JSON despite our prompt.
 */
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

async function generateEmail(jobDescription, managerName, companyName) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY missing');
  }

  const prompt = generatePrompt(jobDescription, managerName, companyName, MY_RESUME);

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }]
  });

  const raw = message?.content?.[0]?.text || '';
  let parsed;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch (err) {
    throw new Error(`Failed to parse Claude response as JSON: ${raw.slice(0, 200)}`);
  }

  if (!parsed.subject || !parsed.body) {
    throw new Error(`Claude response missing subject/body: ${raw.slice(0, 200)}`);
  }

  return {
    subject: parsed.subject.trim(),
    body: parsed.body.trim()
  };
}

module.exports = { generateEmail };

/*
  COST NOTE:
  claude-3-5-sonnet: ~$0.003 per email
  15 emails/day * 30 days = 450 emails/month
  Total cost: ~$1.35/month

  IMPORTANT:
  Claude.ai subscription ($20/mo) != Claude API access.
  Add credits separately at console.anthropic.com.
*/

if (require.main === module) {
  generateEmail(
    'We are hiring a Senior Frontend Engineer with deep React, Next.js, and TypeScript experience. You will own the design system and ship at scale.',
    'Test Manager',
    'Acme Inc'
  ).then(out => {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
