# Chico Stays – Bookings Tracker

A private booking calendar and earnings dashboard for **BGC 24J** and **BGC 8T**.
It runs in any browser, installs on your iPhone Home Screen like an app, and keeps
every device in sync through Supabase. There is no server for you to maintain.

| File | What it is |
|---|---|
| `index.html` | The whole app (HTML + CSS + JavaScript in one file) |
| `supabase-setup.sql` | Creates the database, rules and security in Supabase |
| `manifest.webmanifest`, `sw.js`, `icons/` | Make it installable on iPhone (PWA) |
| `tests/` | Automated tests (optional – not needed to run the app) |

Total cost: **₱0**. Supabase free plan + GitHub Pages.

---

## Step 1 – Create your Supabase project (5 minutes)

1. Go to **https://supabase.com** → **Start your project** → sign up (GitHub or email).
2. Click **New project**.
   - **Name:** `chico-stays`
   - **Database password:** click *Generate* and save it in your password manager
     (the app never needs it).
   - **Region:** **Southeast Asia (Singapore)**, the closest to the Philippines.
3. Click **Create new project** and wait about 1 minute.

## Step 2 – Create the database

1. Open `supabase-setup.sql` in any text editor (TextEdit is fine).
2. Near the bottom, find the section marked `>>> EDIT THIS <<<` and replace
   `you@example.com` with the email you will log in with (lowercase).
   You can add more lines for staff, for example:
   ```sql
   insert into public.team_members (email, role) values
     ('owner@gmail.com', 'owner'),
     ('partner@gmail.com', 'staff')
   on conflict (email) do nothing;
   ```
3. In Supabase, go to **SQL Editor** (left sidebar) → **New query**.
4. Paste the **entire** file and click **Run**. You should see *Success. No rows returned*.

This creates the tables, the double-booking protection, Row Level Security and realtime sync.
It also adds BGC 24J and BGC 8T. Running it again later is safe.

## Step 3 – Create your login

1. **Authentication → Users → Add user → Create new user**.
2. Enter the **same email** you put in the SQL file and a strong password.
3. Tick **Auto Confirm User** → **Create user**.

**Turn off public sign-ups.** This makes sure nobody else can create an account:

4. **Authentication → Sign In / Providers**. Under *User Signups*, switch **off**
   **Allow new users to sign up**, then **Save**.

> Even if sign-ups were left on, a stranger who signed up would still see nothing.
> The database only shows data to emails listed in `team_members`.

## Step 4 – Copy your two public values

Go to **Project Settings** (gear icon):

- **Project URL**: under **Data API**. It looks like `https://abcdefghijkl.supabase.co`
- **Publishable key**: under **API Keys**. It starts with `sb_publishable_…`.
  (If your project only shows *Legacy API keys*, use the **anon / public** key, which starts with `eyJ…`.)

> ⚠️ **Never** use the **secret** key (`sb_secret_…`) or the **service_role** key.
> They bypass all security. The app refuses to run if you paste one.
> The publishable/anon key is designed to be public. Your data is protected
> by the login plus the Row Level Security rules from Step 2.

## Step 5 – Put the values into the app

Open `index.html` in a text editor and find this near the top of the `<script>`
section (search for `const CONFIG`):

```js
const CONFIG = {
  SUPABASE_URL: '',        // e.g. 'https://abcdefghijklmnop.supabase.co'
  SUPABASE_ANON_KEY: '',   // e.g. 'sb_publishable_...'
};
```

Paste your values between the quotes and save:

```js
const CONFIG = {
  SUPABASE_URL: 'https://abcdefghijkl.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_xxxxxxxxxxxxxxxx',
};
```

*(Alternative: leave them empty. The app then shows a **Connect Supabase** screen
where you paste them once per device. Filling them into the file is easier
because every phone and computer works immediately.)*

## Step 6 – Upload to GitHub

1. Sign in at **https://github.com** (create a free account if needed).
2. Click **+** (top right) → **New repository**.
   - **Repository name:** `chico-stays`
   - Choose **Public**. GitHub Pages is free for public repositories.
     Only the app code is public. Your bookings live in Supabase behind your login.
   - Click **Create repository**.
3. On the new repository page, click **uploading an existing file**.
4. Drag these into the upload area:
   - `index.html`
   - `manifest.webmanifest`
   - `sw.js`
   - the whole `icons` folder
5. Click **Commit changes**.

> Don't upload `supabase-setup.sql` once your email is in it. It is only needed in
> Supabase, and in a public repository anyone could read the email. The `tests`
> folder is optional.

## Step 7 – Turn on GitHub Pages

1. In the repository, open **Settings → Pages** (left sidebar).
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Set **Branch** to **main** and the folder to **/ (root)**, then click **Save**.
4. Wait 1–2 minutes and refresh. The page shows
   **Your site is live at `https://YOUR-USERNAME.github.io/chico-stays/`**.

## Step 8 – Allow your site in Supabase (for password-reset emails)

1. Supabase → **Authentication → URL Configuration**.
2. **Site URL:** `https://YOUR-USERNAME.github.io/chico-stays/`
3. Under **Redirect URLs**, click **Add URL** and enter the same address.
4. Click **Save**.

## Step 9 – Install on your iPhone

1. Open your site in **Safari** and sign in.
2. Tap **Share** (the square with an arrow) → **Add to Home Screen** → **Add**.
3. Open **Chico Stays** from your Home Screen. It runs full-screen like an app.

Do the same on any other phone, iPad or computer. Changes made on one device
appear on the others automatically, usually within a second.

---

## Guest Email: one-time Gmail setup (about 15 minutes)

The **Guest Email** tab creates a complete Gmail draft for the building admin.
The draft has the filled-in Guest Information Sheet, the guests' IDs and the
signed house rules attached. To be allowed to create drafts in
`chico.stay.property@gmail.com`, the app needs a free Google "Client ID".

1. Go to **https://console.cloud.google.com** and sign in as **chico.stay.property@gmail.com**.
   Accept the terms if asked.
2. At the top, open the project picker → **New project**.
   Name it `Chico Stays` → **Create**, then make sure it's selected.
3. Search the top bar for **Gmail API**, open it and click **Enable**.
4. Search for **Google Auth Platform** (or *OAuth consent screen*) → **Get started**:
   - **App name:** `Chico Stays`. **User support email:** your Gmail address.
   - **Audience:** **External**.
   - **Contact email:** your Gmail address. Agree to the policy, then click **Create**.
5. In **Google Auth Platform → Audience**, under **Test users**, click **Add users**,
   add `chico.stay.property@gmail.com` and **Save**.
6. In **Google Auth Platform → Clients**, click **Create client**:
   - **Application type:** **Web application**. **Name:** `Chico Stays web`.
   - **Authorized JavaScript origins:** `https://juanaraullo.github.io`
   - **Authorized redirect URIs:** `https://juanaraullo.github.io/chico-stays/`
     (include the final `/`).
   - Click **Create** and copy the **Client ID**. It ends with `.apps.googleusercontent.com`.
7. Put the Client ID in `index.html` → `EMAIL_CONFIG.GOOGLE_CLIENT_ID`, or send it to
   Claude to add. It's public and safe to share. Never share the *Client secret*;
   the app doesn't need it.

**The first time you create a draft**, Google shows *"Google hasn't verified this app"*.
That's expected because it's your own private app. Tap **Continue**, then allow
**"Manage drafts and send emails"**. Sign-in lasts about an hour; after that the app
asks again with one tap.

**Using it:** open a booking → **Prepare guest email**, or use the **Guest Email** tab.
1. Check the guest names, then add the ID photos and the signed house rules photo.
2. Tap **Create Gmail draft**, then **Open Gmail**. The draft is at the top of **Drafts**.
   Check it and tap **Send**.

Your signature (Settings → Signature) is saved on each device. Draw it once per phone or computer.

## Airbnb calendar sync

1. Get each listing's **Export calendar** link in Airbnb:
   **Listings** → choose the listing → **Availability** → **Connect to another website** / **Sync calendars** → **Export calendar**,
   then copy the link (`https://www.airbnb.com/calendar/ical/….ics?s=…`).
2. In Chico Stays, go to **Settings → Airbnb calendars**. Tap the unit → paste the link → **Connect & sync**.

Your database downloads the calendars **every 30 minutes**, or right away with **Sync Airbnb now**.
Reservations show on the calendar with a **dashed bar** as "Airbnb booking". Airbnb's link has **no guest
names or payouts**, only the dates, the reservation code and the last 4 digits of the guest's phone.
Tap one → **Add details** to enter the name and amount, and it becomes a normal booking.
Reservations you already entered (same dates, or the code in the notes) are not shown twice.
**Activity** lists new and cancelled reservations, and warns if a booking you saved as Airbnb
is no longer on Airbnb's calendar.
Booking a Direct/TikTok guest on dates Airbnb already sold is blocked with a warning.

Keep the links private: anyone with one can see your booked dates. They're stored only in your database.

## Activity (history, to-dos, checks)

Tap the **bell** on the Dashboard (on a computer, **Activity** in the sidebar).
- **To do:** things that need you. This includes to-dos left by the AI agent or Claude
  (tap **Done**) and automatic checks: ₱0 amounts, very low nightly rates, more guests
  than the form allows, and guest emails due in the next 3 days (tap **Dismiss** if they're fine).
- **History:** every booking, block and unit change, with who made it
  (**You**, **AI agent** or another team member) and what changed, e.g. *Amount ₱11,250 → ₱0*.
- **App updates:** what was changed in the app and when.

History is written by the database itself, so changes made by the inquiry agent,
another phone or the Supabase dashboard are all included. Entries can't be edited
or deleted from the app.

**For an AI agent** using the secret key, leave a to-do or flag a problem like this:
```sql
insert into public.activity_log (kind, actor, title, message, entity, entity_id)
values ('discrepancy', 'AI agent', 'Payment doesn''t match the quote',
        'Guest sent ₱25,000 but the quote was ₱28,000.', 'booking', '<booking id>');
```
Through the REST API, POST the same fields to `/rest/v1/activity_log`.

## Using the app

- **Dashboard**: combined totals for the selected year, each unit with a mini
  calendar of this month, and upcoming stays.
- **My Units → a unit**: the booking calendar.
  - Tap an **open date** to add a booking with that date as check-in. The *Block dates*
    tab in the same form blocks it instead.
  - Tap a **booked date** for details, **Edit** or **Delete**.
  - Tap a **blocked (striped) date** to edit or remove the block.
  - Use **‹ ›** to change months, tap the **month title** to jump to any month or year,
    and switch to **Full year** for all 12 months.
- **Bookings**: search and filter all bookings (Upcoming / Past / All / Blocked).
- **Settings**: rename or add units, sync, export to CSV, sign out.

### How the numbers are calculated

| Figure | Rule |
|---|---|
| Nights | Check-in night counts, check-out day does not. Dec 1 → Dec 5 = **4 nights** |
| Back-to-back | Allowed: the next guest can check in on the day the previous guest checks out |
| Bookings & earnings per month/year | Counted by the **check-in date** |
| Booked nights per month/year | The **actual nights** that fall inside that month/year |
| Available nights | Nights in the period − booked − blocked |
| Occupancy | Booked nights ÷ (nights in the period − blocked nights) |
| Year-to-date gross | Check-ins from Jan 1 up to today |
| Blocked dates | Never count as bookings or earnings; excluded from occupancy |

### Double-booking protection

Overlaps are stopped in **two places**:
1. **In the app**: the form warns you and disables *Save* while you type.
2. **In the database**: a Postgres exclusion constraint plus triggers reject any
   overlapping booking or block, even if two phones save at the same moment. If that
   ever happens, the app shows a clear message and refreshes the calendar.

---

## Updating the app later

1. Edit `index.html` and upload it to the repository again (**Add file → Upload files**).
2. Open `sw.js` and change `CACHE_VERSION` (e.g. `chico-v1.0.0` → `chico-v1.0.1`),
   then upload it too. This makes installed iPhone apps pick up the new version.
3. Close the app on your iPhone and open it again.

## Good to know

- **Free-plan pause:** Supabase pauses free projects after about **7 days with no
  activity**. Using the app regularly prevents it. If it does pause, open the
  Supabase dashboard and click **Restore project**. No data is lost.
- **Backups:** use **Settings → Export bookings (CSV)** in the app now and then.
- **Adding a team member:** add their email in `team_members`
  (Supabase → **Table Editor → team_members → Insert row**), then create their login
  in **Authentication → Users**.

## Troubleshooting

| Message | Fix |
|---|---|
| *Access not enabled* | Your login email isn't in `team_members`. The screen shows the exact SQL to run. Then tap *Try again*. |
| *The database is not set up yet* | Run `supabase-setup.sql` in the SQL Editor (Step 2). |
| *Incorrect email or password* | Check the user in **Authentication → Users**, or use *Forgot password?*. |
| *Email not confirmed* | In **Authentication → Users**, open the user and confirm them, or recreate them with *Auto Confirm User* ticked. |
| *Could not reach the server* | No internet, or the Supabase project is paused (see above). |
| Password-reset link opens the wrong page | Redo Step 8 with your exact GitHub Pages address. |
| iPhone app shows an old version | Change `CACHE_VERSION` in `sw.js`, upload, then close and reopen the app. |

---

## Ready for future features

The database and code are organised so these can be added without rebuilding:

- **Expense tracking per unit / cleaning & maintenance costs**: a ready-made design for
  `expenses` and `expense_categories` tables is at the end of `supabase-setup.sql`.
  It links to units, and optionally to a booking.
- **Net profit & monthly reports**: the `monthly_unit_revenue` view already groups
  revenue by unit, month and platform. Net profit = that minus expenses.
- **Platform comparisons**: platforms live in their own `platforms` table, and every
  booking references it.
- **Occupancy analytics**: all statistics come from one function, `periodStats()` in
  `index.html`, which works for any date range.

## Tests (for developers)

```bash
node tests/logic.test.js
```
Runs 72 checks on the date, overlap and statistics logic.

```bash
cd tests && npm i @electric-sql/pglite@0.2.17 && node sql.test.mjs ../supabase-setup.sql
```
Runs 31 checks of the SQL script against a real Postgres 17 database: overlap
rejection, back-to-back stays, blocks, RLS for anonymous / non-member / member users,
and re-running the script.

To try the interface without Supabase, serve the folder (for example
`npx http-server -p 8765`) and open `http://localhost:8765/tests/harness.html`.
Log in with `owner@test.dev` / `test1234`. It uses an in-browser mock database.
