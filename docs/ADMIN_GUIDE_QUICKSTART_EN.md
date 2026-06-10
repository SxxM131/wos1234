# Admin Quick Reference

Short operational reference for R4+ admins. Full technical details follow in the next section.

# Player Quick Reference

Short guide for alliance members. **Share this section** when opening the Google Form for applications.

## Before you start

- You need your **Player ID**, **Player Name**, and **alliance** (NWO / BOS / MAR / SXY).
- All times are **UTC** (not KST). Pick every block you can realistically show up for.
- Submitting only saves your **preferences**. Final slot assignment happens **after the booking window closes**.

## How to apply

**Main — Google Form** (use this during the normal application window)

1. Open the Google Form link shared by R4.
2. Enter Player ID, Player Name, and alliance.
3. For each day you want (**Monday VP**, **Tuesday VP**, **Thursday MO**):
   - Enter your **speedup (days)** for that day.
   - Select **one or more** preferred time blocks (UTC).
4. Submit the form.

- Use the **edit link in your confirmation email** to change answers while the form is still open.
- After the form closes, contact R4 for any changes.

**Secret link** (`/r/...`) — **only when R4 tells you to**

- For members who missed the Google Form window or other **special cases after the form has closed**.
- Same fields as above: Player ID, Player Name, alliance, speedup, and preferred blocks per day.
- Do **not** use the secret link if you already applied for that day via the Google Form (duplicate will be rejected).

> You can skip days you do not want — only fill in days you are applying for.

## Rules to know

| Rule | Detail |
|------|--------|
| One application per day | Same **Player ID** cannot apply twice for the same day in the current cycle — the second submission is rejected |
| Google account vs Player ID | The same Google account **can** submit multiple times (e.g. for different Player IDs). The limit is **per Player ID per day**, not per Google account |
| Deadline | Submissions are rejected after R4 closes reservations |
| Google Form + secret link | Using both for the **same day** and same Player ID counts as a duplicate — the second attempt is rejected |
| Assignment | Higher speedup improves priority; results are announced after admin runs assignment |

## Check your status

| When | Where | What you see |
|------|-------|--------------|
| Anytime | Secret link → **Check my application** (`/r/.../check`) | Enter Player ID to view your status |
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
| After form close, before assignment | Contact R4 — they can delete that day so you can **re-apply via the secret link** |
| After assignment | Contact R4 — a change **may** be possible, but canceling or moving slots can affect other players, so R4 will decide case by case |

## Important (R4 admins)

- **Do not press Reset cycle** on the admin dashboard during an active booking period unless you intentionally want to archive and wipe the entire cycle’s applications and assignments.

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
4. `/admin` — share the **Google Form** link with members; use the **secret URL** only for late or special cases after the form closes

---

## Page Routes

| Path | Audience | Description |
|------|----------|-------------|
| `/r/[token]` | Members (late/special) | Application form — after Google Form closes |
| `/r/[token]/check` | Members | Check own application / assignment by Player ID |
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
| B | After close · before assignment | Contact R4 → re-apply **via secret link** | Search → **Delete mon/tue/thu** |
| C | After assignment | Request change from R4 (case by case — may affect others) | Grid **Cancel** only when appropriate |

See **§3.5 Operational Scenarios** below for full tables.

---
