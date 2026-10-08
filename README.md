# Rashcuts — local MySQL + Node admin build

This package keeps the existing Rashcuts frontend intact and adds a small same-origin backend for editable business content.

## Stack

- Frontend: existing static HTML/CSS/JS site
- Backend: Node.js + Express
- Database: MySQL / MySQL 8+
- Authentication: server-side session token stored as a hash in MySQL + HttpOnly cookie
- Image uploads: local `public/uploads/` storage by default

The admin remains a separate route at `/admin/`. It is not linked from the public navigation or footer and is marked `noindex`.

## 1. Install

Install Node.js 20+ and make sure MySQL is running locally.

On Windows, the included `setup-mysql.bat` can install dependencies, create the database and provision the admin account. After setup, `start-rashcuts.bat` starts the site.

Manual setup:

```bash
npm install
cp .env.example .env
```

On Windows Command Prompt, use `copy .env.example .env`; in PowerShell, use `Copy-Item .env.example .env`.

## 2. Configure MySQL

Open `.env` and set the values for the MySQL instance on your PC:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=rashcuts
DB_USER=root
DB_PASSWORD=your-mysql-password
```

Then initialise the database and seed the current Rashcuts services, gallery and Niger State location:

```bash
npm run db:init
```

The schema is in `db/schema.sql`.

## 3. Create the client admin account

Run:

```bash
npm run admin:create -- --email client@example.com
```

You will be prompted for the password. Passwords are stored as bcrypt hashes, never as plain text.

Running the command again for the same email replaces that admin's password, which is also the simple local password-reset path.

## 4. Start Rashcuts

```bash
npm start
```

Open:

- Public site: `http://localhost:3000/`
- Admin: `http://localhost:3000/admin/`
- Backend health: `http://localhost:3000/api/health`

The public site still has local defaults. When the MySQL-backed API responds, it refreshes services/prices, Our Work and studio location in the background.

## Admin controls

The dashboard can update:

- service names
- prices
- descriptions
- service images
- service image alt text
- Our Work images
- gallery labels/categories/order/visibility
- studio name/address/area/LGA/city/state/country
- latitude/longitude
- Google Maps Place ID
- custom Google Maps directions URL
- opening hours
- location wallpaper URL

### Google Maps

Leave the custom directions URL blank to generate a normal Google Maps Directions URL from the saved studio address. A Place ID can optionally be saved when you want the destination matched more precisely.

## Images

Uploaded files are written to:

```text
public/uploads/services/
public/uploads/work/
```

MySQL stores their relative URLs; it does not store the image binary. For production, move uploads to persistent object storage if the server filesystem is ephemeral.

## Security notes

The admin API requires the private session cookie for all write operations. Login attempts are throttled in-process. The server also applies baseline security headers with Helmet, restricts upload types to JPG/PNG/WebP/AVIF, and limits uploads to 10 MB.

For production, put the Node server behind HTTPS and a reverse proxy/CDN, set `NODE_ENV=production`, use a dedicated MySQL user with only the required database permissions, and back up the database and uploaded media.

Do not expose MySQL directly to the public internet. The browser talks to the Express API, not to MySQL.

## Gallery recovery and safe editing

If the gallery was previously saved with only one item, restore the shipped gallery with `npm run db:restore-work`. This preserves custom/uploaded gallery rows and does not restore the removed Rashcuts Studio image. Gallery saves now delete only items explicitly removed in the admin UI; merely having an item absent from a submitted payload no longer deletes it.


### Upgrading an existing Rashcuts MySQL database

If you are updating from the previous MySQL admin build, **do not rerun `npm run db:init` just for this email feature** because the seed file also contains the starter gallery. Run the notification-only migration instead:

```bash
npm run db:migrate-notifications
```

This creates only the `admin_change_events` table and leaves your existing services, prices, gallery, uploads and location data untouched.

## Admin update email digest

Saved admin changes are tracked against the current admin session. They are **not** emailed one-by-one. When the admin clicks **Log out**, Rashcuts collects every successful content change saved during that session and sends **one summary email** to both configured notification addresses.

A session with 10 saved changes therefore produces one message such as:

> Rashcuts admin update — 10 saved changes

The email lists the affected areas/items so the developer and client can see what was changed. Image uploads by themselves are not counted until the image is actually saved to its service/gallery record. If the admin makes no saved changes, no email is sent.

Configure SMTP and the two notification recipients in `.env`:

```env
MAIL_ENABLED=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_SERVICE=
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
MAIL_FROM=admin@yourdomain.com
NOTIFY_DEV_EMAIL=developer@example.com
NOTIFY_CLIENT_EMAIL=client@example.com
```

`SMTP_SERVICE` can be used for providers with a Nodemailer service preset; otherwise use the provider's SMTP host/port settings. The app uses a reusable SMTP transporter and sends the same notification message to both recipients.

The notification system uses Nodemailer SMTP transport. SMTP is provider-neutral, so changing mail providers only requires changing server-side environment variables rather than changing the admin UI or database layer. citeturn751495search0turn751495search4

To test SMTP without changing site content, run:

```bash
npm run email:test
```

If the SMTP settings are missing or invalid, the admin can still log out, but the server reports that the notification could not be sent in its log and the dashboard shows a warning. Configure SMTP before using this in production.
