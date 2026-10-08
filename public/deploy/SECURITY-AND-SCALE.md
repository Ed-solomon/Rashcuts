# Rashcuts — deployment notes

The public frontend remains CDN-friendly. The optional private admin is backed by a small Node/Express API and MySQL database.

## Public site

The existing `public/` tree contains the static site, assets, legal pages, custom error pages and separate `/admin/` UI.

For a static-only deployment, publish the contents of `public/`. The public site keeps local defaults when `/api/public/site-data` is unavailable.

For the editable site, run the whole project behind the Node server (`npm start`) so `/api/*` and `/admin/*` are available on the same origin.

## MySQL backend

Use MySQL 8+ with:

- `admin_users`
- `admin_sessions`
- `site_settings`
- `services`
- `work_items`

Run `npm run db:init` once per environment and provision the client account with `npm run admin:create -- --email client@example.com`.

Do not expose MySQL directly to the public internet. The browser only sees the Express API.

## Admin security

The admin route is separate from public navigation. Authentication uses a random server-side session token stored only as a SHA-256 hash in `admin_sessions`; the browser receives an HttpOnly, SameSite cookie.

Keep `/admin/*` and `/api/admin/*` out of CDN caches. The included static `_headers` file documents those cache/security rules for static hosts, while Express adds Helmet headers at runtime.

Uploads are restricted to JPG/PNG/WebP/AVIF and 10 MB per file. Images are stored outside the database; MySQL stores their relative URLs.

## Production

Use HTTPS, a reverse proxy, a dedicated database user, automated MySQL backups and persistent media storage. Set `NODE_ENV=production` so the admin cookie is marked `Secure`.

A managed object-storage service should replace local uploads if the application filesystem is ephemeral or horizontally scaled.
