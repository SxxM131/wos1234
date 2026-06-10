# Admin Quick Reference

Short operational reference for R4+ admins. Full technical details follow in the next section.

# Player Quick Reference

Short guide for alliance members. **Share this section** when distributing the secret link or Google Form.

## Before you start

- You need your **Game ID**, in-game **name**, and **alliance** (NWO / BOS / MAR / SXY).
- All times are **UTC** (not KST). Pick every block you can realistically show up for.
- Submitting only saves your **preferences**. Final slot assignment happens **after the booking window closes**.

## How to apply

**Option A — Secret link** (from your R4)

1. Open the link shared by R4 (looks like `/r/...`).
2. Enter Game ID, name, and alliance.
3. For each day you want (**Monday VP**, **Tuesday VP**, **Thursday MO**):
   - Enter your **speedup (days)** for that day.
   - Check **one or more** preferred time blocks (UTC).
4. Review the confirmation screen and submit.

**Option B — Google Form**

1. Fill out the form once per Google account (one response limit).
2. Use the **edit link in your confirmation email** if you need to change answers while the form is still open.
3. After the form closes, contact R4 for any changes.

> You can skip days you do not want — only fill in days you are applying for.

## Rules to know

| Rule | Detail |
|------|--------|
| One application per day | Same Game ID cannot apply twice for the same day in the current cycle |
| Deadline | Submissions are rejected after R4 closes reservations |
| Secret link + Google Form | Using both for the **same day** counts as a duplicate — the second attempt is rejected |
| Assignment | Higher speedup improves priority; results are announced after admin runs assignment |

## Check your status

| When | Where | What you see |
|------|-------|--------------|
| Anytime | Secret link → **Check my application** (`/r/.../check`) | Enter Game ID to view your status |
| After assignment | Public schedule **`/status`** | Live slots and waitlist (no login) |

| Status | Meaning |
|--------|---------|
| Application received | Saved successfully; assignment not run yet |
| Assigned | You got a slot — time shown |
| On waitlist | No slot this round — your preferred blocks are listed |

## Need to change something?

| Situation | What to do |
|-----------|------------|
| Google Form still open | Use the **edit response** link in your email |
| After form close, before assignment | Contact R4 — they can delete that day so you can re-apply |
| After assignment | Contact R4 — they may cancel your slot so you can re-apply via the secret link |

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
