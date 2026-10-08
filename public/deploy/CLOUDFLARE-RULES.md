# Rashcuts — Cloudflare production rules

These are the deployment-side pieces that cannot be embedded in the static HTML/CSS/JS bundle itself.

## CDN / caching

Proxy the Rashcuts DNS records through Cloudflare. Cloudflare's static caching handles images, CSS and JavaScript, and Cache Rules can further customize TTLs.

Suggested cache behavior:

- `HTML` / `/`: bypass long browser caching; revalidate.
- `/assets/*`: edge-cache aggressively.
- `/fonts/*`: one year.
- `/styles.css*` and `/script.js*`: one year because v75 uses revisioned `?v=75` URLs.
- Keep query-string handling consistent with the versioned asset URLs.

The repo `_headers` file supplies origin-facing cache directives for supported static hosts.

## WAF

Turn on the provider's managed WAF rules for the zone. Do not put a blanket challenge on all requests; static assets and normal browsing should remain cacheable and low-friction.

## DDoS

Keep the public web hostname proxied through Cloudflare so the CDN/WAF layer can absorb and filter volumetric HTTP traffic before it reaches the origin.

## Rate limiting — future booking/contact API

The current site has no public API endpoint, so there is nothing to rate-limit inside this package yet.

When the backend is connected, create URI-based rate limits such as:

### Booking

Expression:

```text
(http.host eq "YOUR-DOMAIN" and starts_with(http.request.uri.path, "/api/booking"))
```

Starting point:
- 10 requests per minute per IP.
- Action: Managed Challenge first; move to Block for clearly abusive traffic after observing real users.
- Apply only to the dynamic route.

### Contact

Expression:

```text
(http.host eq "YOUR-DOMAIN" and starts_with(http.request.uri.path, "/api/contact"))
```

Starting point:
- 5 requests per minute per IP.
- Action: Managed Challenge first.

Do not count or rate-limit static assets as part of these API rules. Cloudflare's rate-limiting rules can be configured by URI path and request characteristics, and can optionally be applied only to requests that reach the origin.

## Cache purge / release process

For asset-changing releases:

1. Increase `SITE_ASSET_VERSION` in `script.js`.
2. Match the version in the HTML stylesheet/script URLs and font/image references.
3. Publish.
4. Purge the affected Cloudflare cache only if an old non-versioned URL was replaced.

This minimizes origin traffic while preventing stale JS/CSS from sticking around after releases.
