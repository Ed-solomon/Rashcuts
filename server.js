const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const express = require('express');
const helmet = require('helmet');
const multer = require('multer');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_ROOT = path.join(PUBLIC_DIR, 'uploads');
const COOKIE_NAME = process.env.COOKIE_NAME || 'rashcuts_admin_session';
const SESSION_DAYS = Math.max(1, Number(process.env.SESSION_DAYS || 7));
const isProduction = process.env.NODE_ENV === 'production';
const mailEnabled = process.env.MAIL_ENABLED !== 'false';
const notificationDevEmail = String(process.env.NOTIFY_DEV_EMAIL || '').trim();
const notificationClientEmail = String(process.env.NOTIFY_CLIENT_EMAIL || '').trim();
const mailFrom = String(process.env.MAIL_FROM || process.env.SMTP_USER || '').trim();

fs.mkdirSync(path.join(UPLOAD_ROOT, 'services'), { recursive: true });
fs.mkdirSync(path.join(UPLOAD_ROOT, 'work'), { recursive: true });


function buildMailer() {
  if (!mailEnabled || !process.env.SMTP_HOST || !mailFrom) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const transport = {
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000
  };
  if (process.env.SMTP_SERVICE) {
    delete transport.host;
    delete transport.port;
    delete transport.secure;
    transport.service = process.env.SMTP_SERVICE;
  }
  return nodemailer.createTransport(transport);
}
const mailer = buildMailer();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'rashcuts',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 5),
  charset: 'utf8mb4'
});

async function ensureAdminFeatureTables() {
  const [[phoneColumn]] = await pool.query(`SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_settings' AND COLUMN_NAME = 'phone'`);
  if (!Number(phoneColumn?.count)) {
    await pool.query(`ALTER TABLE site_settings ADD COLUMN phone VARCHAR(40) NOT NULL DEFAULT '' AFTER hours`);
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_settings (
      id TINYINT UNSIGNED NOT NULL,
      admin_email VARCHAR(190) NOT NULL DEFAULT '',
      client_email VARCHAR(190) NOT NULL DEFAULT '',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_attempts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      visitor_key VARCHAR(80) NOT NULL DEFAULT '',
      stage VARCHAR(24) NOT NULL DEFAULT 'started',
      channel VARCHAR(24) NOT NULL DEFAULT '',
      service_summary VARCHAR(1000) NOT NULL DEFAULT '',
      service_count INT UNSIGNED NOT NULL DEFAULT 0,
      appointment_date DATE DEFAULT NULL,
      appointment_time VARCHAR(40) NOT NULL DEFAULT '',
      private_session TINYINT(1) NOT NULL DEFAULT 0,
      estimated_total INT UNSIGNED NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ip_hash CHAR(64) NOT NULL DEFAULT '',
      PRIMARY KEY (id),
      KEY idx_booking_created (created_at),
      KEY idx_booking_visitor_stage (visitor_key, stage, created_at)
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    INSERT INTO notification_settings (id, admin_email, client_email)
    VALUES (1, ?, ?)
    ON DUPLICATE KEY UPDATE id=id
  `, [notificationDevEmail, notificationClientEmail]);
}

async function getNotificationSettings() {
  const [rows] = await pool.query('SELECT admin_email, client_email FROM notification_settings WHERE id=1 LIMIT 1');
  const row = rows[0] || {};
  return {
    admin_email: String(row.admin_email || notificationDevEmail || '').trim(),
    client_email: String(row.client_email || notificationClientEmail || '').trim()
  };
}

async function getNotificationRecipients() {
  const settings = await getNotificationSettings();
  return [...new Set([settings.admin_email, settings.client_email].filter(Boolean))];
}

app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

function parseCookies(header = '') {
  return header.split(';').reduce((out, part) => {
    const index = part.indexOf('=');
    if (index === -1) return out;
    const key = part.slice(0, index).trim();
    const value = decodeURIComponent(part.slice(index + 1).trim());
    if (key) out[key] = value;
    return out;
  }, {});
}

function sessionCookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: maxAgeMs
  };
}

function setSessionCookie(res, token) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const cookie = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(isProduction ? ['Secure'] : [])
  ].join('; ');
  res.setHeader('Set-Cookie', cookie);
}

function clearSessionCookie(res) {
  const cookie = [
    `${COOKIE_NAME}=`,
    'Max-Age=0',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(isProduction ? ['Secure'] : [])
  ].join('; ');
  res.setHeader('Set-Cookie', cookie);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function expiresAt() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

async function requireAdmin(req, res, next) {
  try {
    const token = parseCookies(req.headers.cookie || '')[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Authentication required.' });
    const tokenHash = hashToken(token);
    const [rows] = await pool.execute(
      `SELECT s.id, s.admin_user_id, u.email
         FROM admin_sessions s
         JOIN admin_users u ON u.id = s.admin_user_id
        WHERE s.token_hash = ? AND s.expires_at > NOW()
        LIMIT 1`,
      [tokenHash]
    );
    if (!rows.length) return res.status(401).json({ error: 'Session expired. Please log in again.' });
    req.admin = { sessionId: rows[0].id, userId: rows[0].admin_user_id, email: rows[0].email, tokenHash };
    next();
  } catch (error) {
    next(error);
  }
}

async function cleanExpiredSessions() {
  await pool.query('DELETE FROM admin_sessions WHERE expires_at <= NOW()');
}

const failedLogins = new Map();
function loginGuard(req, res, next) {
  const key = `${req.ip}|${String(req.body?.email || '').toLowerCase()}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const entry = failedLogins.get(key);
  if (entry && now - entry.startedAt < windowMs && entry.count >= 8) {
    return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  }
  if (entry && now - entry.startedAt >= windowMs) failedLogins.delete(key);
  req._loginKey = key;
  next();
}

function recordLoginFailure(key) {
  const existing = failedLogins.get(key);
  const now = Date.now();
  if (!existing || now - existing.startedAt >= 15 * 60 * 1000) failedLogins.set(key, { startedAt: now, count: 1 });
  else existing.count += 1;
}
function clearLoginFailure(key) { if (key) failedLogins.delete(key); }

function safeUploadName(value) {
  return String(value || 'image')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'image';
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const kind = req.query.kind === 'work' ? 'work' : 'services';
      cb(null, path.join(UPLOAD_ROOT, kind));
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const base = safeUploadName(path.basename(file.originalname, ext));
      cb(null, `${base}-${crypto.randomBytes(5).toString('hex')}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
    if (!allowed.has(file.mimetype)) return cb(new Error('Only JPG, PNG, WebP or AVIF images are allowed.'));
    cb(null, true);
  }
});


const CHANGE_FIELDS = {
  location: [
    ['name', 'studio name'], ['address', 'address'], ['area', 'area'], ['lga', 'LGA'], ['city', 'city'],
    ['state', 'state'], ['country', 'country'], ['latitude', 'latitude'], ['longitude', 'longitude'],
    ['place_id', 'Google Maps Place ID'], ['directions_url', 'directions link'], ['hours', 'opening hours'], ['wallpaper_url', 'location wallpaper']
  ],
  service: [
    ['name', 'name'], ['category', 'category'], ['price', 'price'], ['description', 'description'],
    ['image_url', 'image'], ['image_alt', 'image alt text']
  ],
  work: [
    ['image_url', 'image'], ['image', 'image file'], ['alt', 'alt text'], ['service', 'label'],
    ['category', 'category'], ['sort_order', 'order'], ['active', 'visibility']
  ],
  notifications: [
    ['admin_email', 'admin email'], ['client_email', 'client email']
  ]
};

function comparable(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function changedFields(before, after, kind) {
  return (CHANGE_FIELDS[kind] || []).filter(([key]) => comparable(before?.[key]) !== comparable(after?.[key])).map(([, label]) => label);
}

function formatMoney(value) {
  return `₦${Number(value || 0).toLocaleString('en-NG')}`;
}

async function recordChange(sessionId, userId, area, action, entityId, summary, connection = pool) {
  if (!sessionId || !userId || !summary) return;
  await connection.execute(
    `INSERT INTO admin_change_events (admin_session_id, admin_user_id, area, action, entity_id, summary)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionId, userId, area, action, entityId ? String(entityId) : '', String(summary).slice(0, 800)]
  );
}

async function pendingChangesForSession(sessionId) {
  if (!sessionId) return [];
  const [rows] = await pool.execute(
    `SELECT id, area, action, entity_id, summary, created_at
       FROM admin_change_events
      WHERE admin_session_id = ? AND email_sent_at IS NULL
      ORDER BY created_at ASC, id ASC`,
    [sessionId]
  );
  return rows;
}

function changeTitle(change) {
  const area = { location: 'Location', service: 'Service', work: 'Our Work', notifications: 'Notifications' }[change.area] || 'Site';
  return `${area}: ${change.summary}`;
}

async function sendChangeSummaryEmail({ email, sessionId, changes }) {
  const recipients = await getNotificationRecipients();
  if (!recipients.length || !mailer || !mailFrom || recipients.length < 2 || !changes.length) return { sent: false, configured: false };
  const subject = `Rashcuts admin update — ${changes.length} saved change${changes.length === 1 ? '' : 's'}`;
  const lines = [
    'RASHCUTS / ADMIN UPDATE',
    '',
    `Admin: ${email}`,
    `Saved changes: ${changes.length}`,
    '',
    ...changes.map((change, index) => `${index + 1}. ${changeTitle(change)}`),
    '',
    'This summary was sent when the admin signed out. Multiple saves in the same admin session are intentionally bundled into this single notification.',
  ];
  const htmlItems = changes.map((change) => `<li style="margin:0 0 10px"><strong>${escapeHtml({ location: 'Location', service: 'Service', work: 'Our Work', notifications: 'Notifications' }[change.area] || 'Site')}</strong> — ${escapeHtml(change.summary)}</li>`).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#efede8;font-family:Arial,sans-serif;color:#0b0a0d"><div style="max-width:620px;margin:32px auto;background:#fbfaf7;border:1px solid #e1ded8;border-radius:20px;padding:28px"><div style="font-size:11px;letter-spacing:.16em;color:#6b676e">RASHCUTS / ADMIN UPDATE</div><h1 style="font-family:Georgia,serif;font-size:32px;line-height:1;margin:12px 0 8px">${changes.length} saved change${changes.length === 1 ? '' : 's'}.</h1><p style="color:#6b676e;line-height:1.6;margin:0 0 18px">${escapeHtml(email)} updated the Rashcuts site during this admin session.</p><ul style="padding-left:20px;line-height:1.5">${htmlItems}</ul><p style="margin:20px 0 0;color:#6b676e;font-size:12px;line-height:1.5">One notification covers the entire session up to logout.</p></div></body></html>`;
  await mailer.sendMail({ from: mailFrom, to: recipients, subject, text: lines.join('\n'), html });
  await pool.execute('UPDATE admin_change_events SET email_sent_at = NOW() WHERE admin_session_id = ? AND email_sent_at IS NULL', [sessionId]);
  return { sent: true, configured: true };
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'mysql', time: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ ok: false, database: 'unavailable', error: 'MySQL connection failed.' });
  }
});


const BUILTIN_WORK_ITEMS = [
  ['blonde-taper.webp', 'Blonde taper haircut — finished look at Rashcuts', 'Blonde Taper', 'Finished work', 0],
  ['starter-locs.webp', 'Starter locs styling — defined finish at Rashcuts', 'Starter Locs', 'Texture', 1],
  ['two-strand-twists.webp', 'Two-strand twists — clean sectioned styling at Rashcuts', 'Two-Strand Twists', 'Texture', 2],
  ['360-waves.webp', '360 waves — polished wave pattern at Rashcuts', '360 Waves', 'Finished work', 3],
  ['waves.webp', 'Waves hairstyle — polished wave pattern at Rashcuts', 'Waves', 'Finished work', 4],
  ['service-locs-twist.webp', 'Locs and twist styling — clean finished look at Rashcuts', 'Locs / Twist Styling', 'Texture', 5],
  ['buzz-cut-line-up.webp', 'Buzz cut with line-up — crisp finished shape at Rashcuts', 'Buzz Cut + Line-Up', 'Finished work', 6],
  ['drop-fade.webp', 'Drop fade — clean finished fade at Rashcuts', 'Drop Fade', 'Fades', 7],
  ['high-taper-fade.webp', 'High taper fade — textured finished haircut at Rashcuts', 'High Taper Fade', 'Fades', 8],
  ['mid-taper-fade.webp', 'Mid taper fade — clean finished haircut at Rashcuts', 'Mid Taper Fade', 'Fades', 9],
  ['taper-beard.webp', 'Taper and beard grooming — finished service at Rashcuts', 'Taper + Beard', 'Grooming', 10],
  ['22-plus-black-mens-cuts.webp', "Men's haircut inspiration — modern finished look at Rashcuts", "Men's Cuts", 'Inspiration', 11],
  ['modern-textured-fade.webp', 'Modern textured fade — finished haircut at Rashcuts', 'Textured Fade', 'Fades', 12],
  ['modern-classic-haircut.webp', 'Modern classic haircut — clean scissor finish at Rashcuts', 'Classic Cut', 'Finished work', 13],
  ['luxury-full-grooming.webp', 'Full grooming haircut and beard finish at Rashcuts', 'Full Grooming', 'Grooming', 14],
  ['black-men-beard-grooming.webp', 'Beard grooming — clean shaped finish at Rashcuts', 'Beard Grooming', 'Grooming', 15]
];
const BUILTIN_WORK_BY_IMAGE = new Map(BUILTIN_WORK_ITEMS.map(([image]) => [image, true]));
async function ensureBuiltinWorkRows() {
  for (const [image, alt, service, category, sort_order] of BUILTIN_WORK_ITEMS) {
    await pool.execute(
      `INSERT INTO work_items (image, image_url, alt, service, category, sort_order, active)
       SELECT ?, '', ?, ?, ?, ?, 1
       WHERE NOT EXISTS (SELECT 1 FROM work_items WHERE image = ?)`,
      [image, alt, service, category, sort_order, image]
    );
  }
}

function mergeWorkItems(dbRows = [], includeInactive = false) {
  const byImage = new Map(dbRows.filter(row => row && row.image).map(row => [String(row.image), row]));
  const builtins = BUILTIN_WORK_ITEMS.map(([image, alt, service, category, sort_order]) => {
    const existing = byImage.get(image);
    if (existing) return existing;
    return { id: null, image, image_url: '', alt, service, category, sort_order, active: 1, created_at: null };
  }).filter(row => includeInactive || Number(row.active) === 1);
  const builtinNames = new Set(BUILTIN_WORK_ITEMS.map(([image]) => image));
  const custom = dbRows.filter(row => row && !builtinNames.has(String(row.image || '')) && Number(row.active) === 1);
  return [...builtins, ...custom].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
}

function isLocalUploadAvailable(imageUrl) {
  const value = String(imageUrl || '').trim();
  if (!value) return true;
  if (!value.startsWith('/uploads/')) return true;
  const relative = value.split('?')[0].split('#')[0].replace(/^\/+/, '');
  const resolved = path.resolve(PUBLIC_DIR, relative);
  const uploadRoot = path.resolve(UPLOAD_ROOT);
  if (!resolved.startsWith(uploadRoot + path.sep) && resolved !== uploadRoot) return false;
  return fs.existsSync(resolved);
}

function filterUnavailableWorkItems(rows = []) {
  return rows.filter((row) => {
    if (!row) return false;
    // A shipped gallery image always falls back to /assets/our-work/<image>.
    if (BUILTIN_WORK_BY_IMAGE.has(String(row.image || ''))) return true;
    return isLocalUploadAvailable(row.image_url);
  });
}

async function cleanupMissingCustomWorkRows() {
  const [rows] = await pool.query(`SELECT id, image_url, image FROM work_items WHERE image_url LIKE '/uploads/work/%'`);
  for (const row of rows) {
    if (BUILTIN_WORK_BY_IMAGE.has(String(row.image || ''))) continue;
    if (!isLocalUploadAvailable(row.image_url)) {
      await pool.execute('DELETE FROM work_items WHERE id=?', [row.id]);
    }
  }
}

app.get('/api/public/site-data', async (req, res, next) => {
  try {
    const [[location], [services], [work]] = await Promise.all([
      pool.query(`SELECT id, name, address, area, lga, city, state, country, latitude, longitude, place_id, directions_url, hours, phone, wallpaper_url FROM site_settings WHERE id='main' LIMIT 1`),
      pool.query(`SELECT id, category, name, price, description, image_name, image_url, image_alt, sort_order FROM services ORDER BY category ASC, sort_order ASC`),
      pool.query(`SELECT id, image, image_url, alt, service, category, sort_order, active, created_at FROM work_items ORDER BY sort_order ASC, created_at ASC`)
    ]);
    res.set('Cache-Control', 'no-store');
    res.json({ location: location[0] || null, services, work: filterUnavailableWorkItems(mergeWorkItems(work)) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/login', loginGuard, async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const [rows] = await pool.execute('SELECT id, email, password_hash FROM admin_users WHERE email = ? LIMIT 1', [email]);
    const valid = rows.length ? await bcrypt.compare(password, rows[0].password_hash) : false;
    if (!valid) {
      recordLoginFailure(req._loginKey);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    clearLoginFailure(req._loginKey);

    await cleanExpiredSessions();
    const token = crypto.randomBytes(32).toString('base64url');
    await pool.execute(
      'INSERT INTO admin_sessions (admin_user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [rows[0].id, hashToken(token), expiresAt()]
    );
    setSessionCookie(res, token);
    res.json({ user: { id: rows[0].id, email: rows[0].email } });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/logout', async (req, res, next) => {
  try {
    const token = parseCookies(req.headers.cookie || '')[COOKIE_NAME];
    const tokenHash = token ? hashToken(token) : '';
    let session = null;
    if (tokenHash) {
      const [rows] = await pool.execute(
        `SELECT s.id, s.admin_user_id, u.email
           FROM admin_sessions s
           JOIN admin_users u ON u.id = s.admin_user_id
          WHERE s.token_hash = ?
          LIMIT 1`,
        [tokenHash]
      );
      session = rows[0] || null;
    }

    let notificationSent = false;
    const notificationRecipients = await getNotificationRecipients();
    let notificationConfigured = Boolean(mailer && mailFrom && notificationRecipients.length === 2);
    let changeCount = 0;
    if (session) {
      const changes = await pendingChangesForSession(session.id);
      changeCount = changes.length;
      if (changes.length && notificationConfigured) {
        try {
          const result = await sendChangeSummaryEmail({ email: session.email, sessionId: session.id, changes });
          notificationSent = Boolean(result.sent);
        } catch (mailError) {
          console.error('Rashcuts change notification failed:', mailError.message);
        }
      }
      await pool.execute('DELETE FROM admin_change_events WHERE admin_session_id = ? AND email_sent_at IS NOT NULL', [session.id]);
      await pool.execute('DELETE FROM admin_sessions WHERE id = ?', [session.id]);
    }
    clearSessionCookie(res);
    res.json({ ok: true, notificationSent, notificationConfigured, changeCount });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/session', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT COUNT(*) AS count FROM admin_change_events WHERE admin_session_id = ? AND email_sent_at IS NULL', [req.admin.sessionId]);
    res.json({ authenticated: true, user: { id: req.admin.userId, email: req.admin.email }, pendingChanges: Number(rows[0]?.count || 0) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/notification-status', requireAdmin, async (req, res, next) => {
  try {
    const recipients = await getNotificationRecipients();
    res.json({
      enabled: mailEnabled,
      configured: Boolean(mailer && mailFrom && recipients.length === 2),
      recipientCount: recipients.length,
      senderConfigured: Boolean(mailFrom),
      smtpConfigured: Boolean(mailer)
    });
  } catch (error) { next(error); }
});

app.get('/api/admin/notification-settings', requireAdmin, async (req, res, next) => {
  try { res.json(await getNotificationSettings()); } catch (error) { next(error); }
});

app.put('/api/admin/notification-settings', requireAdmin, async (req, res, next) => {
  try {
    const adminEmail = String(req.body?.admin_email || '').trim().toLowerCase();
    const clientEmail = String(req.body?.client_email || '').trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(adminEmail) || !emailPattern.test(clientEmail)) {
      return res.status(400).json({ error: 'Enter a valid admin email and client email.' });
    }
    const before = await getNotificationSettings();
    await pool.execute(
      `INSERT INTO notification_settings (id, admin_email, client_email) VALUES (1, ?, ?)
       ON DUPLICATE KEY UPDATE admin_email=VALUES(admin_email), client_email=VALUES(client_email)`,
      [adminEmail, clientEmail]
    );
    const after = await getNotificationSettings();
    const changed = changedFields(before, after, 'notifications');
    if (changed.length) await recordChange(req.admin.sessionId, req.admin.userId, 'notifications', 'update', 'routing', `Updated ${changed.join(', ')}.`, pool);
    res.json(after);
  } catch (error) { next(error); }
});

const bookingAttempts = new Map();
function bookingAttemptGuard(req, res, next) {
  const key = String(req.ip || 'unknown');
  const now = Date.now();
  const windowMs = 60 * 1000;
  const entry = bookingAttempts.get(key);
  if (entry && now - entry.startedAt < windowMs && entry.count >= 20) return res.status(429).json({ error: 'Too many booking requests. Please try again shortly.' });
  if (!entry || now - entry.startedAt >= windowMs) bookingAttempts.set(key, { startedAt: now, count: 1 });
  else entry.count += 1;
  next();
}

const bookingIpSecret = process.env.BOOKING_IP_HASH_SECRET || process.env.COOKIE_SECRET || 'rashcuts-booking';
function hashBookingIp(value) { return crypto.createHmac('sha256', bookingIpSecret).update(String(value || '')).digest('hex'); }

app.post('/api/booking/attempt', bookingAttemptGuard, async (req, res, next) => {
  try {
    const stage = ['started','contact'].includes(String(req.body?.stage || '')) ? String(req.body.stage) : 'started';
    const channel = stage === 'contact' && ['whatsapp','call'].includes(String(req.body?.channel || '')) ? String(req.body.channel) : '';
    const visitorKey = String(req.body?.visitor_key || '').trim().slice(0, 80);
    const servicesSummary = String(req.body?.service_summary || '').trim().slice(0, 1000);
    const serviceCount = Math.max(0, Math.min(50, Number(req.body?.service_count || 0)));
    const appointmentDate = String(req.body?.appointment_date || '').trim();
    const appointmentTime = String(req.body?.appointment_time || '').trim().slice(0, 40);
    const privateSession = req.body?.private_session ? 1 : 0;
    const estimatedTotal = Math.max(0, Math.min(100000000, Number(req.body?.estimated_total || 0)));
    if (!visitorKey || !servicesSummary) return res.status(400).json({ error: 'Booking attempt payload is incomplete.' });

    const duplicateWindow = stage === 'started' ? 10 : 3;
    const [duplicates] = await pool.execute(
      `SELECT id FROM booking_attempts WHERE visitor_key=? AND stage=? AND created_at >= (NOW() - INTERVAL ${duplicateWindow} MINUTE) ORDER BY id DESC LIMIT 1`,
      [visitorKey, stage, duplicateWindow]
    );
    if (duplicates.length) return res.json({ ok: true, tracked: false, id: duplicates[0].id });

    const [result] = await pool.execute(
      `INSERT INTO booking_attempts (visitor_key, stage, channel, service_summary, service_count, appointment_date, appointment_time, private_session, estimated_total, ip_hash)
       VALUES (?, ?, ?, ?, ?, NULLIF(?, ''), ?, ?, ?, ?)`,
      [visitorKey, stage, channel, servicesSummary, serviceCount, appointmentDate, appointmentTime, privateSession, estimatedTotal, hashBookingIp(req.ip)]
    );
    res.status(201).json({ ok: true, tracked: true, id: result.insertId });
  } catch (error) { next(error); }
});

app.get('/api/admin/bookings/summary', requireAdmin, async (req, res, next) => {
  try {
    const [[today]] = await pool.query(`SELECT COUNT(*) AS count FROM booking_attempts WHERE created_at >= CURRENT_DATE() AND stage='started'`);
    const [[last7]] = await pool.query(`SELECT COUNT(*) AS count FROM booking_attempts WHERE created_at >= (NOW() - INTERVAL 7 DAY) AND stage='started'`);
    const [[last30]] = await pool.query(`SELECT COUNT(*) AS count FROM booking_attempts WHERE created_at >= (NOW() - INTERVAL 30 DAY) AND stage='started'`);
    const [[total]] = await pool.query(`SELECT COUNT(*) AS count FROM booking_attempts WHERE stage='started'`);
    const [[started7]] = await pool.query(`SELECT COUNT(*) AS count FROM booking_attempts WHERE created_at >= (NOW() - INTERVAL 7 DAY) AND stage='started'`);
    const [[contact7]] = await pool.query(`SELECT COUNT(*) AS count FROM booking_attempts WHERE created_at >= (NOW() - INTERVAL 7 DAY) AND stage='contact'`);
    const [[whatsapp7]] = await pool.query(`SELECT COUNT(*) AS count FROM booking_attempts WHERE created_at >= (NOW() - INTERVAL 7 DAY) AND stage='contact' AND channel='whatsapp'`);
    const [recent] = await pool.query(`
      SELECT id, stage, channel, service_summary, service_count, appointment_date, appointment_time, private_session, estimated_total, created_at
      FROM booking_attempts ORDER BY id DESC LIMIT 8
    `);
    res.json({ today:Number(today.count||0), last7:Number(last7.count||0), last30:Number(last30.count||0), total:Number(total.count||0), started7:Number(started7.count||0), contact7:Number(contact7.count||0), whatsapp7:Number(whatsapp7.count||0), recent });
  } catch (error) { next(error); }
});

app.get('/api/admin/bookings', requireAdmin, async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 80)));
    const [rows] = await pool.query(`
      SELECT id, stage, channel, service_summary, service_count, appointment_date, appointment_time, private_session, estimated_total, created_at
      FROM booking_attempts ORDER BY id DESC LIMIT ${limit}
    `);
    res.json(rows);
  } catch (error) { next(error); }
});

app.get('/api/admin/site-data', requireAdmin, async (req, res, next) => {
  try {
    await ensureBuiltinWorkRows();
    await cleanupMissingCustomWorkRows();
    const [[location], [services], [work]] = await Promise.all([
      pool.query(`SELECT * FROM site_settings WHERE id='main' LIMIT 1`),
      pool.query(`SELECT * FROM services ORDER BY category ASC, sort_order ASC`),
      pool.query(`SELECT * FROM work_items ORDER BY sort_order ASC, created_at ASC`)
    ]);
    res.json({ location: location[0] || null, services, work: filterUnavailableWorkItems(mergeWorkItems(work, true)) });
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/location', requireAdmin, async (req, res, next) => {
  try {
    const data = req.body || {};
    const numberOrNull = (value) => {
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    };
    const values = [
      String(data.name || 'RASHCUTS / STUDIO').trim(),
      String(data.address || '').trim(),
      String(data.area || '').trim(),
      String(data.lga || '').trim(),
      String(data.city || '').trim(),
      String(data.state || '').trim(),
      String(data.country || 'Nigeria').trim(),
      numberOrNull(data.latitude),
      numberOrNull(data.longitude),
      String(data.place_id || '').trim(),
      String(data.directions_url || '').trim(),
      String(data.hours || '').trim(),
      String(data.phone || '').trim().slice(0, 40),
      String(data.wallpaper_url || '').trim()
    ];
    if (!values[1] || !values[4] || !values[5]) return res.status(400).json({ error: 'Address, city and state are required.' });
    const [beforeRows] = await pool.query(`SELECT * FROM site_settings WHERE id='main' LIMIT 1`);
    const beforeRow = beforeRows[0] || null;
    await pool.execute(
      `INSERT INTO site_settings
        (id, name, address, area, lga, city, state, country, latitude, longitude, place_id, directions_url, hours, phone, wallpaper_url)
       VALUES ('main', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        name=VALUES(name), address=VALUES(address), area=VALUES(area), lga=VALUES(lga), city=VALUES(city),
        state=VALUES(state), country=VALUES(country), latitude=VALUES(latitude), longitude=VALUES(longitude),
        place_id=VALUES(place_id), directions_url=VALUES(directions_url), hours=VALUES(hours), phone=VALUES(phone), wallpaper_url=VALUES(wallpaper_url)`,
      values
    );
    const [rows] = await pool.query(`SELECT * FROM site_settings WHERE id='main' LIMIT 1`);
    const row = rows[0] || null;
    const changed = changedFields(beforeRow || {}, row || {}, 'location');
    if (changed.length) await recordChange(req.admin.sessionId, req.admin.userId, 'location', 'update', 'main', `Updated ${changed.join(', ')}.`);
    res.json(row);
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/services/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    const data = req.body || {};
    const price = Number(data.price);
    if (!id || !String(data.name || '').trim() || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: 'Service name and a valid non-negative price are required.' });
    }
    const [beforeRows] = await pool.execute('SELECT * FROM services WHERE id=? LIMIT 1', [id]);
    const beforeRow = beforeRows[0] || null;
    if (!beforeRow) return res.status(404).json({ error: 'Service not found.' });
    const nextData = {
      name: String(data.name).trim(), category: String(data.category || 'service').trim(), price: Math.round(price),
      description: String(data.description || '').trim(), image_url: String(data.image_url || '').trim(), image_alt: String(data.image_alt || '').trim()
    };
    await pool.execute(
      `UPDATE services SET name=?, category=?, price=?, description=?, image_url=?, image_alt=? WHERE id=?`,
      [nextData.name, nextData.category, nextData.price, nextData.description, nextData.image_url, nextData.image_alt, id]
    );
    const [rows] = await pool.execute('SELECT * FROM services WHERE id=? LIMIT 1', [id]);
    const row = rows[0] || null;
    const changed = changedFields(beforeRow || {}, row || {}, 'service');
    if (changed.length) {
      const details = [];
      if (beforeRow.price !== row.price) details.push(`price ${formatMoney(beforeRow.price)} → ${formatMoney(row.price)}`);
      if (beforeRow.image_url !== row.image_url) details.push('image replaced');
      const headline = changed.includes('price') && details.length ? `${row.name}: ${details.join(', ')}` : `${row.name}: updated ${changed.join(', ')}`;
      await recordChange(req.admin.sessionId, req.admin.userId, 'service', 'update', id, headline);
    }
    res.json(row);
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/work', requireAdmin, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const deleteIds = Array.isArray(req.body?.delete_ids)
      ? [...new Set(req.body.delete_ids.map((id) => String(id)).filter(Boolean))]
      : [];
    await connection.beginTransaction();
    const [existingRows] = await connection.query('SELECT * FROM work_items');
    const existingById = new Map(existingRows.map(row => [String(row.id), row]));

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index] || {};
      const service = String(item.service || '').trim() || 'Rashcuts';
      const category = String(item.category || '').trim() || 'Finished work';
      const imageUrl = String(item.image_url || '').trim();
      const image = String(item.image || '').trim();
      const alt = String(item.alt || '').trim() || 'Rashcuts finished work';
      const active = item.active === false || item.active === 'false' ? 0 : 1;
      const sortOrder = Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) : index;
      const id = item.id ? String(item.id) : '';

      if (id && existingById.has(id)) {
        const before = existingById.get(id);
        await connection.execute(
          `UPDATE work_items SET image=?, image_url=?, alt=?, service=?, category=?, sort_order=?, active=? WHERE id=?`,
          [image, imageUrl, alt, service, category, sortOrder, active, id]
        );
        const after = { ...before, image, image_url: imageUrl, alt, service, category, sort_order: sortOrder, active };
        const changed = changedFields(before, after, 'work');
        if (changed.length) {
          const imageChanged = before.image_url !== imageUrl || before.image !== image;
          const summary = imageChanged ? `${service}: image replaced${active !== before.active ? `, ${active ? 'shown' : 'hidden'}` : ''}` : `${service}: updated ${changed.join(', ')}`;
          await recordChange(req.admin.sessionId, req.admin.userId, 'work', 'update', id, summary, connection);
        }
      } else {
        const [result] = await connection.execute(
          `INSERT INTO work_items (image, image_url, alt, service, category, sort_order, active) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [image, imageUrl, alt, service, category, sortOrder, active]
        );
        await recordChange(req.admin.sessionId, req.admin.userId, 'work', 'add', result.insertId, `${service}: added gallery image`, connection);
      }
    }

    for (const deleteId of deleteIds) {
      const before = existingById.get(deleteId);
      if (before) {
        if (BUILTIN_WORK_BY_IMAGE.has(String(before.image || ''))) {
          await connection.execute('UPDATE work_items SET active=0 WHERE id=?', [deleteId]);
        } else {
          await connection.execute('DELETE FROM work_items WHERE id=?', [deleteId]);
        }
        if (String(before.image_url || '').startsWith('/uploads/')) {
          const relative = String(before.image_url).split('?')[0].split('#')[0].replace(/^\/+/, '');
          const resolved = path.resolve(PUBLIC_DIR, relative);
          const uploadRoot = path.resolve(UPLOAD_ROOT);
          if ((resolved === uploadRoot || resolved.startsWith(uploadRoot + path.sep)) && fs.existsSync(resolved)) {
            try { fs.unlinkSync(resolved); } catch (_) {}
          }
        }
        await recordChange(req.admin.sessionId, req.admin.userId, 'work', 'remove', deleteId, `${before.service || 'Gallery image'}: removed gallery image`, connection);
      }
    }

    await connection.commit();
    const [work] = await connection.query('SELECT * FROM work_items ORDER BY sort_order ASC, created_at ASC');
    res.json(work);
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.post('/api/admin/upload', requireAdmin, (req, res, next) => {
  upload.single('image')(req, res, (error) => {
    if (error) return res.status(400).json({ error: error.message || 'Image upload failed.' });
    if (!req.file) return res.status(400).json({ error: 'Choose an image file first.' });
    const kind = req.query.kind === 'work' ? 'work' : 'services';
    res.json({ url: `/uploads/${kind}/${req.file.filename}`, filename: req.file.filename });
  });
});

app.use(express.static(PUBLIC_DIR, {
  index: 'index.html',
  extensions: ['html'],
  maxAge: isProduction ? '1h' : 0
}));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API route not found.' });
  const notFound = path.join(PUBLIC_DIR, 'errors', '404.html');
  if (fs.existsSync(notFound)) return res.status(404).sendFile(notFound);
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Server error. Please try again.' });
  const page = path.join(PUBLIC_DIR, 'errors', '500.html');
  if (fs.existsSync(page)) return res.status(500).sendFile(page);
  res.status(500).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

let server;
(async () => {
  try {
    await ensureAdminFeatureTables();
    server = app.listen(PORT, () => {
      console.log(`Rashcuts running at http://localhost:${PORT}`);
      console.log(`Admin: http://localhost:${PORT}/admin/`);
    });
  } catch (error) {
    console.error('Rashcuts startup failed:', error);
    process.exit(1);
  }
})();

const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down…`);
  if (!server) { await pool.end(); process.exit(0); return; }
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
