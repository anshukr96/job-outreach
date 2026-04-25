// File: src/followup.js
// Phase 7 follow-up. Finds outreach rows that were sent 3+ days ago,
// haven't received a reply, and have follow_up_count = 0. Sends one
// short bump email and increments the counter.

require('dotenv').config();
const {
  getLeadsNeedingFollowUp,
  incrementFollowUp,
  getDailySentCount
} = require('./db/supabase');
const { sendEmail, DAILY_LIMIT } = require('./sender/emailSender');
const MY_RESUME = require('./context/resume');

function buildFollowUpBody(managerName) {
  const firstName = (managerName || '').split(' ')[0] || 'there';
  return [
    `Hi ${firstName},`,
    '',
    'Just floating this back to the top in case it got buried.',
    '',
    'Still happy to do a quick 15-min chat if the timing works.',
    '',
    MY_RESUME.name,
    `Resume: ${MY_RESUME.resumeUrl} | Portfolio: ${MY_RESUME.portfolioUrl}`
  ].join('\n');
}

async function runFollowUps() {
  const sentToday = await getDailySentCount();
  let remaining = DAILY_LIMIT - sentToday;
  if (remaining <= 0) {
    console.log('Daily limit already reached — no follow-ups today.');
    return;
  }

  const rows = await getLeadsNeedingFollowUp(3);
  console.log(`[followup] ${rows.length} candidates needing a bump.`);

  for (const row of rows) {
    if (remaining <= 0) break;

    const lead = row.leads;
    if (!lead?.manager_email) continue;

    const subject = row.subject_line?.startsWith('Re: ')
      ? row.subject_line
      : `Re: ${row.subject_line || 'Quick note'}`;
    const body = buildFollowUpBody(lead.manager_name);

    const result = await sendEmail(lead.manager_email, subject, body);
    if (result.success) {
      await incrementFollowUp(row.id);
      remaining--;
      console.log(`Bumped -> ${lead.manager_name} (${lead.manager_email})`);
    } else {
      console.log(`Bump failed -> ${lead.manager_email}: ${result.error || result.reason}`);
      if (result.reason === 'daily_limit_reached') break;
    }

    // Same human-like spacing as the main pipeline.
    await new Promise(r => setTimeout(r, 30000 + Math.random() * 60000));
  }
}

if (require.main === module) {
  runFollowUps()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runFollowUps };
