const nodemailer = require('nodemailer');
require('dotenv').config();

const recipients = [...new Set([process.env.NOTIFY_DEV_EMAIL, process.env.NOTIFY_CLIENT_EMAIL].map((value) => String(value || '').trim()).filter(Boolean))];
const from = String(process.env.MAIL_FROM || process.env.SMTP_USER || '').trim();
const port = Number(process.env.SMTP_PORT || 587);
const secure = process.env.SMTP_SECURE === 'true' || port === 465;

if (process.env.MAIL_ENABLED === 'false') throw new Error('MAIL_ENABLED=false. Set MAIL_ENABLED=true in .env before testing email.');
if (!process.env.SMTP_HOST && !process.env.SMTP_SERVICE) throw new Error('Set SMTP_HOST or SMTP_SERVICE in .env before testing email.');
if (!from) throw new Error('Set MAIL_FROM (or SMTP_USER) in .env before testing email.');
if (!recipients.length) throw new Error('Set NOTIFY_DEV_EMAIL and NOTIFY_CLIENT_EMAIL in .env before testing email.');

const transport = process.env.SMTP_SERVICE
  ? { service: process.env.SMTP_SERVICE, auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 }
  : { host: process.env.SMTP_HOST, port, secure, auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 };

(async () => {
  const transporter = nodemailer.createTransport(transport);
  await transporter.sendMail({
    from,
    to: recipients,
    subject: 'Rashcuts admin notification — SMTP test',
    text: 'This is a test of the Rashcuts admin notification email. The live admin sends one bundled change summary when the admin logs out.',
    html: '<p><strong>Rashcuts admin notification test</strong></p><p>The live admin sends one bundled change summary when the admin logs out.</p>'
  });
  console.log(`Test email sent to ${recipients.join(', ')}`);
})().catch((error) => {
  console.error('Test email failed:', error.message);
  process.exitCode = 1;
});
