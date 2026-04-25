// File: src/sender/emailSender.js
// Sends mail through Gmail using an App Password. Hard caps at 15/day
// to keep Gmail's spam filter happy.

require('dotenv').config();
const nodemailer = require('nodemailer');
const { getDailySentCount } = require('../db/supabase');

const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT || '15', 10);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

async function sendEmail(to, subject, body, options = {}) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return { success: false, error: 'Gmail credentials missing' };
  }

  // Guard: re-check the daily limit on every send. The orchestrator also
  // tracks remainingQuota in memory, but if multiple workers ever ran in
  // parallel this DB check is the source of truth.
  const sentToday = await getDailySentCount();
  if (sentToday >= DAILY_LIMIT) {
    console.log('[sender] Daily send limit reached. Aborting.');
    return { success: false, reason: 'daily_limit_reached' };
  }

  const fromName = process.env.SENDER_NAME || 'Your Name';
  const mailOptions = {
    from: `${fromName} <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text: body,
    html: `<p>${body.replace(/\n/g, '<br>')}</p>`,
    ...options
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { sendEmail, DAILY_LIMIT };
