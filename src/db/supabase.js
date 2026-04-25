// File: src/db/supabase.js
// All database operations live here. Every other module should
// import from this file and never touch the Supabase client directly.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/**
 * Returns the number of emails marked as "sent" in the last 24h.
 * Used as the daily-limit guard.
 */
async function getDailySentCount() {
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count, error } = await supabase
    .from('outreach')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'sent')
    .gte('sent_at', since);
  if (error) {
    console.error('getDailySentCount error:', error.message);
    return 0;
  }
  return count || 0;
}

async function saveJob(job) {
  const { data, error } = await supabase
    .from('jobs')
    .insert(job)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function isJobNew(jobId) {
  const { data, error } = await supabase
    .from('jobs')
    .select('id')
    .eq('job_id', jobId)
    .maybeSingle();
  if (error) {
    console.error('isJobNew error:', error.message);
    return true; // fail-open: treat as new so we don't lose jobs to DB hiccups
  }
  return !data;
}

async function saveLead(lead) {
  const { data, error } = await supabase
    .from('leads')
    .insert(lead)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function leadAlreadyContacted(email) {
  // Guards against double-contacting the same person across multiple jobs.
  const { data, error } = await supabase
    .from('leads')
    .select('id')
    .eq('manager_email', email)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('leadAlreadyContacted error:', error.message);
    return false;
  }
  return !!data;
}

async function saveOutreach(outreach) {
  const { data, error } = await supabase
    .from('outreach')
    .insert(outreach)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function markAsSent(outreachId) {
  const { error } = await supabase
    .from('outreach')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', outreachId);
  if (error) console.error('markAsSent error:', error.message);
}

async function markAsFailed(outreachId, reason) {
  const { error } = await supabase
    .from('outreach')
    .update({ status: 'failed', notes: reason })
    .eq('id', outreachId);
  if (error) console.error('markAsFailed error:', error.message);
}

async function getLeadsNeedingFollowUp(daysAgo = 3) {
  const cutoff = new Date(Date.now() - daysAgo * 86400000).toISOString();
  const { data, error } = await supabase
    .from('outreach')
    .select(`
      id,
      subject_line,
      lead_id,
      job_id,
      sent_at,
      leads!inner ( manager_name, manager_email )
    `)
    .eq('status', 'sent')
    .eq('reply_received', false)
    .eq('follow_up_count', 0)
    .lte('sent_at', cutoff);
  if (error) {
    console.error('getLeadsNeedingFollowUp error:', error.message);
    return [];
  }
  return data || [];
}

async function incrementFollowUp(outreachId) {
  // Read-modify-write because Supabase JS doesn't expose increment for non-RPC.
  const { data, error: readErr } = await supabase
    .from('outreach')
    .select('follow_up_count')
    .eq('id', outreachId)
    .single();
  if (readErr) {
    console.error('incrementFollowUp read error:', readErr.message);
    return;
  }
  const next = (data?.follow_up_count || 0) + 1;
  const { error } = await supabase
    .from('outreach')
    .update({ follow_up_count: next })
    .eq('id', outreachId);
  if (error) console.error('incrementFollowUp write error:', error.message);
}

module.exports = {
  supabase,
  getDailySentCount,
  saveJob,
  isJobNew,
  saveLead,
  leadAlreadyContacted,
  saveOutreach,
  markAsSent,
  markAsFailed,
  getLeadsNeedingFollowUp,
  incrementFollowUp
};
