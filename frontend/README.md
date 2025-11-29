# Buy Your Pixels – Frontend

- API base (all fetchers): `VITE_API_URL` (must include `/api`, e.g. `https://api.yourpixels.online/api`).
- OAuth, auth, purchases, stats, and checkout rely on the normalized API base to avoid `/api/api` duplication.
- CORS, cookies, and server responses are JSON-only; the backend exposes only `/api/*`.
- Payments run through Stripe’s Payment Element (no custom PayPal SDK; additional wallets are managed directly in Stripe if enabled).

## DNS Dependency Warning
The platform must stay mapped to these records; API failures or cookie issues can occur if DNS deviates:

- `@    A      76.76.21.21`
- `www  CNAME  <vercel-dns-address>`
- `api  CNAME  <railway-domain>`
