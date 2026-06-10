# Admin Quick Reference

Short operational reference for R4+ admins. Full technical details follow in the next section.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service role — **server only, never expose to client** |
| `IRON_SESSION_SECRET` | Admin session key (32+ random characters) |

Generate session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Deployment (Vercel)

1. Push to GitHub
2. Vercel **Import** → register all 4 environment variables
3. After deploy: `/admin/setup` — set admin password (one-time)
4. `/admin` — copy Secret URL and share with alliance members

---

## Page Routes

| Path | Audience | Description |
|------|----------|-------------|
| `/r/[token]` | Members | Application form (secret URL) |
| `/r/[token]/check` | Members | Check own application / assignment |
| `/status` | Public | Live schedule and waitlist |
| `/admin` | R4+ | Admin dashboard |
| `/admin/login` | R4+ | Password login |
| `/admin/setup` | R4+ | Initial password setup |
| `/admin/guide` | R4+ | This guide |

---

## npm Scripts (maintenance)

| Script | Description |
|--------|-------------|
| `npm run check-env` | Validate environment variables |
| `npm run set-admin-password` | Set admin password from CLI |
| `npm run run:batch` | Run batch assignment (same as Admin button) |
| `npm run verify:assignment` | Verify assignment (V1–V5) |
| `npm run inject:random -- N` | Inject N random test applications |
| `npm run clear:assignments` | Clear current cycle assignments only |

---

## Reservation Changes (summary)

| # | Timing | Player | R4+ Admin |
|---|--------|--------|-----------|
| A | Google Form edit window open | Edit via email response link | — |
| B | After close · before assignment | Contact R4 | Search → **Delete mon/tue/thu** → player re-applies |
| C | After assignment | Request change from R4 | Grid **Cancel** → player re-applies via secret URL |

See **§3.5 Operational Scenarios** below for full tables.

---
