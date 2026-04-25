// File: dashboard/src/App.jsx
// Optional Vite + React dashboard. For the first 30 days you can skip
// this entirely and use Supabase's Table Editor as your dashboard.
//
// Setup (when you're ready):
//   npm create vite@latest dashboard -- --template react
//   cd dashboard && npm install @supabase/supabase-js
//   Replace dashboard/src/App.jsx with this file.
//   Set VITE_SUPABASE_URL and VITE_SUPABASE_KEY in dashboard/.env
//   npm run dev

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);

function StatCard({ label, value }) {
  return (
    <div style={{ background: '#1a1a1a', padding: 16, borderRadius: 8 }}>
      <div style={{ fontSize: 12, opacity: 0.6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState('today');
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({ sent: 0, replied: 0, companies: 0 });

  useEffect(() => {
    async function load() {
      const todayIso = new Date(Date.now() - 86400000).toISOString();
      let query = supabase.from('outreach_dashboard').select('*');

      if (tab === 'today') query = query.gte('sent_at', todayIso).eq('status', 'sent');
      if (tab === 'pipeline') query = query.eq('status', 'pending');
      if (tab === 'replies') query = query.eq('reply_received', true);

      const { data } = await query.order('sent_at', { ascending: false });
      setRows(data || []);

      const { count: sent } = await supabase
        .from('outreach').select('*', { count: 'exact', head: true }).eq('status', 'sent');
      const { count: replied } = await supabase
        .from('outreach').select('*', { count: 'exact', head: true }).eq('reply_received', true);
      const { data: companies } = await supabase
        .from('jobs').select('company_name');
      setStats({
        sent: sent || 0,
        replied: replied || 0,
        companies: new Set((companies || []).map(c => c.company_name)).size
      });
    }
    load();
  }, [tab]);

  const replyRate = stats.sent ? ((stats.replied / stats.sent) * 100).toFixed(1) : '0.0';

  return (
    <div style={{ fontFamily: 'system-ui', padding: 24, color: '#eee', background: '#0a0a0a', minHeight: '100vh' }}>
      <h1>Job Outreach Dashboard</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <StatCard label="Total Sent" value={stats.sent} />
        <StatCard label="Replies" value={stats.replied} />
        <StatCard label="Reply Rate" value={`${replyRate}%`} />
        <StatCard label="Companies" value={stats.companies} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['today', 'pipeline', 'replies'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 16px',
              background: tab === t ? '#2563eb' : '#1a1a1a',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              textTransform: 'capitalize'
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #333' }}>
            <th style={{ padding: 8 }}>When</th>
            <th style={{ padding: 8 }}>Company</th>
            <th style={{ padding: 8 }}>Manager</th>
            <th style={{ padding: 8 }}>Subject</th>
            <th style={{ padding: 8 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.outreach_id} style={{ borderBottom: '1px solid #1a1a1a' }}>
              <td style={{ padding: 8 }}>{r.sent_at ? new Date(r.sent_at).toLocaleString() : '-'}</td>
              <td style={{ padding: 8 }}>{r.company_name}</td>
              <td style={{ padding: 8 }}>{r.manager_name}</td>
              <td style={{ padding: 8 }}>{r.subject_line}</td>
              <td style={{ padding: 8 }}>
                {r.reply_received ? 'replied' : r.status}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', opacity: 0.6 }}>No rows yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
