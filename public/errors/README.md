# Rashcuts custom error pages

These pages cover the common client, auth, upload, rate-limit and server/gateway failure states used by the current public/admin architecture: 400, 401, 403, 404, 405, 408, 409, 410, 413, 415, 422, 429, 431, 451, 500, 501, 502, 503, 504, 507, 508 and 511.

`404.html` is duplicated at the site root because static hosts commonly use the root 404 file automatically. The remaining pages are available under `/errors/<status>.html` and can be mapped by the hosting layer to their corresponding HTTP status when the platform supports custom error documents.
