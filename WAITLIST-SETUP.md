# Waitlist on Cloudflare (one-time setup, ~10 minutes)

The site includes two small Cloudflare Pages Functions:
- `functions/api/waitlist.js`: saves each signup (POST /api/waitlist)
- `functions/api/waitlist-export.js`: downloads all signups as a CSV

Signups are stored in Cloudflare KV, inside your own Cloudflare account. Each email is saved once; if someone signs up again (say from the Summit button), their record is updated and their interests are combined.

## 1. Create the storage
Cloudflare dashboard → **Storage & Databases → KV** → **Create a namespace** → name it `opus-waitlist`.

## 2. Connect it to the site
**Workers & Pages** → your opuscollect.net project → **Settings → Bindings → Add → KV namespace**
- Variable name: `WAITLIST` (exactly this, all caps)
- KV namespace: `opus-waitlist`

## 3. Add your private export key
Same project → **Settings → Variables and Secrets → Add**
- Name: `EXPORT_KEY`
- Value: a long password only you know
- Select **Encrypt**, then **Save**

## 4. Deploy WITH the functions folder
Important: **drag-and-drop uploads in the dashboard do not include the `functions` folder.** Use one of these:
- **GitHub (recommended):** put this folder in a GitHub repo and connect it to the Pages project. Every push redeploys.
- **Wrangler:** from inside this folder run `npx wrangler pages deploy . --project-name=<your-project-name>`

After deploying, redeploy once more if you added the binding/secret after the last deploy.

## 5. Test it
Open opuscollect.net/join.html, sign up with your own email. You should see "You're on the list."

## Getting your list
Visit: `https://opuscollect.net/api/waitlist-export?key=YOUR_EXPORT_KEY`
A CSV downloads with: joined date, full name, artist name, email, Instagram, other socials, role, interests (membership / summit / conferences), country, and whether they reached Kit.
Anyone without the key gets a 404. Don't share that link.

You can also browse entries directly in the dashboard: KV → opus-waitlist.

## Kit (emailing the list)
Every signup is also sent to your Kit form **10621918** (Opus Waitlist). Cloudflare keeps the backup copy.
The CSV export has a `kit` column: `ok` means they reached Kit. If you see `failed`, import that CSV into Kit (Subscribers → Import).

**Optional extras in Kit:**
- **Custom fields:** Subscribers → click any subscriber → Add a field. Create `artist_name`, `instagram`, `other_socials`, `role` and `interests` (exact keys) to see those answers in Kit.
- **Tags:** create `membership`, `summit`, `conferences` tags in Kit. Open each one; the number in its web address is its ID. In Cloudflare (Settings → Variables and Secrets) add `KIT_TAG_MEMBERSHIP`, `KIT_TAG_SUMMIT`, `KIT_TAG_CONFERENCES` with those numbers, then redeploy.
- **Confirmation email:** by default Kit emails new signups a "confirm your subscription" link (Form → Settings → Incentive). Leave it on for cleaner delivery, or turn it off so everyone is subscribed instantly.

**Sending an email:** Kit → Send → Broadcasts → New. Kit requires a mailing address in the footer (a P.O. box is fine).
