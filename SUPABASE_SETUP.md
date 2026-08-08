# Setting up accounts and storage for Scale Up

This guide sets up the part of Scale Up that remembers who you are and keeps your
projects safe. It takes about **30–40 minutes** the first time, and you only ever
have to do it once.

**You do not need to be technical.** Every step tells you exactly what to click and
what to type. If a step mentions something you have never heard of, there is a short
plain-English explanation next to it.

Grab a cup of tea and a notepad — there are four bits of information you will need to
write down as you go.

---

## Before you start: three words explained

| Word | What it actually means |
|---|---|
| **Supabase** | The company that will store your projects and handle sign-in. Free to start. Think of it as a very secure filing cabinet that lives on the internet. |
| **Vercel** | The company that puts your Scale Up website online so other people can visit it. |
| **Environment variable** | A setting you give the app, kept separately from the code because it is private. It is just a name and a value, like `NEXT_PUBLIC_SUPABASE_URL = https://something.supabase.co`. |

There is also a **checklist** at the very bottom. Tick things off as you go.

---

# A. Create a free Supabase account and project

1. Open a web browser and go to **https://supabase.com**

2. Click the **Start your project** button (top right, green).

3. Sign up. The easiest option is **Continue with GitHub** if you have a GitHub
   account. If you do not, choose the email option and use your normal work email.
   You may be asked to confirm your email address — check your inbox and click the
   link.

4. Once you are signed in you land on the **dashboard**. If this is a brand new
   account it will ask you to create an **organisation** first. Give it your company
   name (for example `Smith Building Ltd`), leave the plan as **Free**, and click
   **Create organisation**.

5. Now click the green **New project** button.

6. Fill in the form:

   - **Name** — type `scale-up`. This is just a label for you; it does not appear
     anywhere in the app.
   - **Database Password** — click the **Generate a password** link so Supabase
     invents a strong one for you.

     > ### ⚠️ Stop here and read this
     >
     > **Copy that password and save it somewhere safe right now** — a password
     > manager, or written in a notebook you keep. Supabase shows it to you
     > **once and never again**.
     >
     > You almost certainly will never need it (Scale Up does not use it). But if
     > you ever do need it and have not saved it, the only way out is to reset it.
     > Ten seconds now saves a headache later.

   - **Region** — choose the one closest to you. If you are in the UK, pick
     **West EU (London)** or **West EU (Ireland)**. This just makes the app a
     fraction faster; any region works.
   - **Pricing plan** — leave it on **Free**.

7. Click **Create new project**.

8. Supabase now builds your database. This takes **one to two minutes** and you will
   see a spinner or a "Setting up project" message. Go and put the kettle on. When it
   finishes you will see a dashboard with charts on it.

✅ **Part A done.** You now own a database.

---

# B. Find your two keys

Scale Up needs two pieces of information from Supabase: an **address** and a **key**.

1. Look at the left-hand sidebar. At the bottom, click the **cog / gear icon**
   (⚙️ **Project Settings**).

2. In the settings menu that appears, click **API**.

   > Depending on when you read this, Supabase may label this page **API Keys** or
   > put the URL under **General**. If you cannot see it, use the search box at the
   > top of the dashboard and type `API`.

3. You are looking at two things on this page:

   - **Project URL** — a web address that looks like
     `https://abcdefghijklmnop.supabase.co`
   - **Project API keys** → the one labelled **`anon`** **`public`** — a very long
     string of letters and numbers that starts with `eyJ`. It may be hidden behind a
     **Reveal** or **Copy** button.

4. Copy both of these into your notepad. Label them clearly. You will paste them in
   Part D.

   Tip: use the little **copy** icon next to each value rather than selecting the text
   by hand — the anon key is hundreds of characters long and it is very easy to miss
   the last few.

### About safety — please read this bit

On that same page you will also see a key called **`service_role`**, usually marked
**secret**. Here is the difference, in plain terms:

| Key | What it is | Rule |
|---|---|---|
| **anon / public** | A "front door key" that only works together with the security rules you will install in Part C. On its own it can do nothing. | **Safe.** It is *designed* to sit in the browser where anyone can see it. This is normal and correct. |
| **service_role** | A master key. It ignores every security rule and can read, change or delete every row belonging to every user. | **Never.** Never put it in this app. Never email it. Never paste it into a chat, a support ticket, or a website. Never commit it to GitHub. |

If you ever accidentally expose the `service_role` key, go to that same API page and
click the option to **roll** (regenerate) it immediately.

Scale Up **never** needs the `service_role` key. If any instruction anywhere ever asks
you for it, something is wrong.

✅ **Part B done.** You have the Project URL and the anon key written down.

---

# C. Create the projects table

Right now your database is empty. This step creates the one table Scale Up uses, and —
more importantly — installs the security rules that stop one customer from seeing
another customer's work.

1. In the left-hand sidebar of Supabase, click **SQL Editor**. The icon looks like a
   little terminal or database symbol.

2. Click **New query** (top left of that panel). You get a big empty white box.

3. Now open the file `supabase/schema.sql` from the Scale Up code on your computer.
   Open it with any plain text editor — Notepad on Windows, TextEdit on a Mac, or
   VS Code if you have it.

4. Select **everything** in that file (`Ctrl` + `A` on Windows, `Cmd` + `A` on a Mac)
   and copy it (`Ctrl`/`Cmd` + `C`).

5. Click into the big empty box in the Supabase SQL Editor and paste
   (`Ctrl`/`Cmd` + `V`).

6. Click the green **Run** button at the bottom right. (Keyboard shortcut:
   `Ctrl`/`Cmd` + `Enter`.)

7. After a second or two you should see **Success. No rows returned** in the results
   panel underneath. That is exactly what you want — this script creates things, it
   does not look anything up, so having no rows come back is the correct outcome.

   If you get a red error message instead, jump to the **Troubleshooting** table at
   the bottom of this guide.

8. **Check it worked.** In the left sidebar click **Table Editor**. You should now see
   a table called **projects** listed. Click it — it will be empty, which is right,
   because you have not saved a project yet.

> ### Is it safe to run that file again?
>
> Yes. The script is written to be run over and over without harm. It will not delete
> your projects or duplicate anything. If you are ever unsure whether it ran properly,
> just run it again.

✅ **Part C done.** Your database has a table and a locked door.

---

# D. Tell the app about your two keys

The app cannot guess your Project URL and key — you have to hand them over. You need
to do this in **two places**: once on your own computer, and once on the live website.

## D1 — On your own computer (for testing)

1. Open the Scale Up project folder on your computer.

2. Find the file called **`.env.local.example`**.

3. Make a **copy** of it in the same folder, and rename the copy to exactly:

   ```
   .env.local
   ```

   Note the full stop at the front and **no** `.txt` on the end. On Windows you may
   need to turn on *File name extensions* in File Explorer's **View** menu to see the
   real filename.

   > Windows can be stubborn about filenames starting with a full stop. If it refuses,
   > open the folder in VS Code and create the file there instead.

4. Open `.env.local` in a text editor. Fill in the values so it looks like this, with
   your own values after the `=` signs:

   ```
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.....
   ```

   **The names must be spelled exactly as shown**, in capitals, with underscores.
   `NEXT_PUBLIC_SUPABASE_URL` is right; `NEXT_PUBLIC_SUPABASE_URI` or
   `next_public_supabase_url` will not work.

   Other rules:
   - No spaces either side of the `=`.
   - No quote marks around the values.
   - Each one on a single line, even though the key is very long and wraps on screen.

5. Save the file.

6. If the app is already running, **stop it and start it again**
   (`Ctrl` + `C` in the terminal, then `npm run dev`). Environment variables are only
   read at start-up, so a running app will not notice the new file.

## D2 — On the live website (Vercel)

1. Go to **https://vercel.com** and sign in.

2. Click your Scale Up project.

3. Click **Settings** along the top, then **Environment Variables** in the left menu.

4. Add each variable one at a time. For each:
   - **Key** (or **Name**): `NEXT_PUBLIC_SUPABASE_URL`
   - **Value**: paste your Project URL
   - **Environments**: make sure **Production**, **Preview** and **Development** are
     all ticked
   - Click **Save**

5. Repeat for `NEXT_PUBLIC_SUPABASE_ANON_KEY`, pasting the long anon key.

6. (If it is not already there, add `ANTHROPIC_API_KEY` too — the drawing analysis
   needs it.)

7. **Very important:** Vercel does not apply new variables to the site that is already
   live. Go to the **Deployments** tab, find the newest deployment at the top, click
   the **`⋯`** menu on the right, and choose **Redeploy**. Confirm.

   If you skip this, the live site will carry on as though you never added anything.

✅ **Part D done.**

---

# E. Turn on email sign-in

Email sign-in is switched on by default, so this is mostly a check.

1. In Supabase, click **Authentication** in the left sidebar.

2. Click **Providers** (in some versions it is called **Sign In / Providers**).

3. Find **Email** in the list. It should already be **enabled** (green toggle). If it
   is not, click it and switch it on.

4. Open it and check the setting **Confirm email** is on. Leave everything else alone.

### How the magic link works (so you can explain it to your users)

There is **no password** in Scale Up. Here is what happens instead:

1. A user types their email address on the sign-in page and clicks the button.
2. Supabase emails them a link. It usually arrives within a few seconds.
3. They click the link in that email, on the same device.
4. Their browser opens Scale Up and they are signed in. Done.

That link is single-use and expires after about an hour. This is called a
**magic link**. It is genuinely more secure than a password, because there is no
password to guess, reuse or leak — and there is nothing for your users to forget.

> ### One thing to know about the free email service
>
> Supabase's built-in email sender is meant for testing. It is **rate-limited to a
> handful of emails per hour**, and messages sometimes land in **spam**.
>
> That is fine while you and a couple of colleagues are trying things out. Before you
> let real customers loose on it, connect a proper email service under
> **Project Settings → Authentication → SMTP Settings**. Free options that work well
> are **Resend**, **SendGrid** or **Postmark**. Each will walk you through it; you
> paste a handful of settings into that Supabase page.
>
> Tell your first testers to **check their spam folder** if the email does not appear.

✅ **Part E done.**

---

# F. Set up "Sign in with Google"

This is the fiddliest part of the whole guide, because it involves a second company
(Google) with its own console. Take it slowly, follow the steps in order, and it will
work first time. Budget 15 minutes.

You are going to do three things:
- **F1** — create a project in Google's developer console
- **F2** — tell Google your app exists and what it is called
- **F3** — get an ID and a secret from Google, and paste them into Supabase

## F0 — First, find your "project ref"

You will need this in a moment, so let us get it now.

1. Look at your Supabase Project URL from Part B. It looks like:

   ```
   https://abcdefghijklmnop.supabase.co
   ```

2. The bit in the middle — `abcdefghijklmnop` — is your **project ref**. It is a
   random-looking string of about 20 lowercase letters. It is unique to you.

3. Write down the following, replacing the middle part with **your** project ref:

   ```
   https://abcdefghijklmnop.supabase.co/auth/v1/callback
   ```

   This is your **callback URL**. You will paste it into Google in step F3.

   > You can also find the same URL ready-made inside Supabase:
   > **Authentication → Providers → Google**. When you expand Google there is a
   > **Callback URL (for OAuth)** box with a copy button. Using that copy button is
   > the safest option, because there is no chance of a typo.

## F1 — Create a Google Cloud project

1. Go to **https://console.cloud.google.com**

2. Sign in with the Google account you want to own this. A normal Gmail account is
   fine. Use a company account if you have one — it is easier to hand over later.

3. If this is your first time, Google will show you terms to accept. Accept them.

4. At the very top of the page, next to the "Google Cloud" logo, there is a
   **project selector** — a dropdown that might say "Select a project" or show an
   existing project name. Click it.

5. In the window that opens, click **NEW PROJECT** (top right).

6. **Project name**: type `Scale Up`. Leave Organisation/Location as they are.

7. Click **CREATE**. Wait a few seconds; a notification appears when it is ready.

8. Click the project selector again and **select your new "Scale Up" project**.
   Check the top of the screen now says `Scale Up`. This matters — it is easy to
   configure the wrong project by accident.

## F2 — The OAuth consent screen

This is the screen your users will see that says *"Scale Up wants to access your Google
Account"*. Google makes you fill it in before it will give you any keys.

1. In the search box at the top of Google Cloud Console, type
   **OAuth consent screen** and click the result. (Or navigate:
   **☰ menu → APIs & Services → OAuth consent screen**.)

2. If asked **"Which audience do you want to target?"** or **User Type**, choose
   **External**, then click **CREATE**.

   > **External** simply means "anyone with a Google account can sign in", which is
   > what you want. **Internal** would only allow people inside your own Google
   > Workspace organisation, and is not available on a personal Gmail account anyway.

3. Fill in the **App information** page:

   - **App name**: `Scale Up` — this is what your users will see, so spell it nicely.
   - **User support email**: pick your email from the dropdown.
   - **App logo**: skip it. Uploading a logo triggers a Google verification review
     you do not want to deal with today.
   - **Application home page / privacy policy / terms**: leave blank for now.
   - **Developer contact information**: type your email address again. This one is
     required.

4. Click **SAVE AND CONTINUE**.

5. **Scopes** page: click **SAVE AND CONTINUE** without changing anything. Supabase
   asks for the basic email and profile permissions automatically.

6. **Test users** page (you may or may not see this): while your app is in
   "Testing" mode, only email addresses listed here can sign in. Click **+ ADD USERS**
   and add your own email address and any colleagues who will be testing. Then
   **SAVE AND CONTINUE**.

7. **Summary** page: click **BACK TO DASHBOARD**.

8. **When you are ready for real customers**, come back to this page and click
   **PUBLISH APP** (you may see it as "Publish app" under Publishing status). Confirm.
   Until you do this, anyone not on your test-user list will be turned away with an
   error.

   For the basic email/profile permissions Scale Up uses, publishing is instant — you
   do **not** need to go through Google's lengthy verification review.

## F3 — Create the credentials

1. In the left menu click **Credentials** (still under **APIs & Services**).

2. At the top click **+ CREATE CREDENTIALS**, then choose **OAuth client ID**.

3. **Application type**: choose **Web application** from the dropdown.

4. **Name**: type `Scale Up Web`. This is internal only; nobody sees it.

5. Scroll down to **Authorised redirect URIs**. This is the single most important box
   on this page — get it wrong and Google will refuse to sign anyone in.

   Click **+ ADD URI** and paste your callback URL from step **F0**:

   ```
   https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
   ```

   For example, if your Project URL is `https://xkcdqwertyuiopasdfgh.supabase.co`
   then you type:

   ```
   https://xkcdqwertyuiopasdfgh.supabase.co/auth/v1/callback
   ```

   Check all of the following before moving on:
   - it starts with `https://` (not `http://`)
   - it ends with `/auth/v1/callback` — no trailing slash after `callback`
   - there are no spaces anywhere, including at the end
   - it is your **Supabase** address, **not** your Vercel address and **not**
     `localhost`

   > **Why Supabase and not your own website?** Google hands the user back to
   > Supabase, Supabase checks everything is genuine, and only then does Supabase send
   > the user on to your site. Your own web address goes in Part G instead, not here.

   Leave **Authorised JavaScript origins** empty. You do not need it.

6. Click **CREATE**.

7. A box pops up titled **OAuth client created**, showing:

   - **Your Client ID** — a long string ending in
     `.apps.googleusercontent.com`
   - **Your Client Secret** — a shorter string, often starting `GOCSPX-`

   **Copy both now.** Keep this box open, or use the **Download JSON** button. The
   secret can be viewed again later from the Credentials page, but it is far easier
   to grab it while it is in front of you.

   The Client Secret is a genuine secret — treat it like the `service_role` key.
   Do not email it or paste it anywhere public.

## F4 — Paste them into Supabase

1. Go back to your **Supabase** tab.

2. Click **Authentication** → **Providers** (or **Sign In / Providers**).

3. Find **Google** in the list and click it to expand it.

4. Switch **Enable Sign in with Google** **on**.

5. Paste:
   - **Client IDs** ← your Google **Client ID**
   - **Client Secret** ← your Google **Client Secret**

   Watch out for a stray space at the start or end when pasting.

6. Click **Save**.

✅ **Part F done.** You will test it in a moment.

---

# G. Redirect URLs — do not skip this

> **Please read this section even if you are rushing.** Missing it is the single
> most common reason people get stuck. The symptom is maddening: you click the magic
> link or finish signing in with Google, and instead of getting into the app you are
> dumped straight back on the login page, with no error message telling you why.

Supabase will only send a freshly signed-in user back to a web address you have
explicitly approved. This is a safety feature — it stops someone building a fake site
that hijacks your users' sign-in links. But it means you must list your addresses.

1. In Supabase, click **Authentication** in the left sidebar.

2. Click **URL Configuration**.

3. **Site URL** — set this to the main address of your live site, for example:

   ```
   https://scale-up.vercel.app
   ```

   You will find your exact address at the top of your project's page on Vercel.
   Include the `https://`, and **no** trailing slash.

   If you have not deployed to Vercel yet, put `http://localhost:3000` here for now
   and come back and change it once you have.

4. **Redirect URLs** — this is a list, and you can add several. Click **Add URL** for
   each of the following:

   ```
   http://localhost:3000/**
   ```

   ```
   https://scale-up.vercel.app/**
   ```

   (Replace the second one with your real Vercel address.)

   The `/**` on the end is a wildcard meaning "and anything underneath this address".
   It is two asterisks. Without it, only the exact home page would be allowed and
   sign-in would fail whenever a user was coming back to any other page.

5. If you also want the temporary preview links Vercel generates for each change to
   work, add this as well:

   ```
   https://*-your-vercel-team.vercel.app/**
   ```

   This one is optional — skip it if you are not sure.

6. Click **Save**.

### Now test it

1. Start the app on your own computer (`npm run dev`) and open
   **http://localhost:3000**

2. You should be sent to the sign-in page.

3. Try **email**: enter your address, click the button, check your inbox (and your
   spam folder), click the link. You should land inside the app.

4. Sign out, then try **Sign in with Google**. You should see Google's account
   chooser, then Google's "Scale Up wants to access…" screen, then be returned to the
   app, signed in.

5. Create a test project, then check it actually saved: back in Supabase, go to
   **Table Editor → projects**. You should see one row, with a `user_id` filled in.

6. Repeat steps 2–4 on your live Vercel site.

✅ **All done.** Have another cup of tea; you have earned it.

---

# H. Troubleshooting

Find your symptom in the left column.

| What you are seeing | What is actually wrong | How to fix it |
|---|---|---|
| Sign-in seems to work, then it bounces me straight back to the login page | Your address is not in Supabase's approved list | **Part G.** Add `http://localhost:3000/**` and your live `https://…/**` address under **Authentication → URL Configuration → Redirect URLs**. Remember the `/**`. |
| `requested path is invalid` in the browser address bar after clicking the magic link | Same cause as above | **Part G.** |
| `redirect_uri_mismatch` — a Google error page | The redirect URI in Google Cloud does not exactly match your Supabase callback | **Step F3.5.** It must be `https://<your-project-ref>.supabase.co/auth/v1/callback`. Compare it character by character against the copy button in Supabase → Authentication → Providers → Google. Changes can take a couple of minutes to take effect. |
| `Access blocked: Scale Up has not completed the Google verification process` | Your Google app is still in Testing mode and this person is not a test user | Either add their email under **OAuth consent screen → Test users**, or click **PUBLISH APP** (**step F2.8**). |
| The magic-link email never arrives | Spam folder, or you have hit the free sending limit | Check spam first. If you have requested several links in quick succession, wait an hour. For anything beyond testing, set up proper SMTP (**Part E**). |
| `Invalid API key` or `Failed to fetch` in the app | The URL or anon key is wrong, missing, or the app was not restarted | Re-check `.env.local` for typos and stray spaces (**Part D1**), then stop and restart the app. Variables are only read at start-up. |
| Works on my computer but not on the live site | The variables were never added to Vercel, or the site was not redeployed after adding them | **Part D2.** Add both variables, then **Deployments → ⋯ → Redeploy**. |
| `relation "public.projects" does not exist` | The schema was never run, or was run on a different Supabase project | **Part C.** Run `supabase/schema.sql` again, then confirm the table appears in **Table Editor**. |
| I can sign in, but saving a project fails, or my projects list is always empty | Row Level Security is on but the four policies are missing | Run `supabase/schema.sql` again (**Part C**). It is safe to re-run. Then in the SQL Editor run `select policyname, cmd from pg_policies where tablename = 'projects';` — you should get exactly four rows. |
| Red error when running the SQL script | Usually only part of the file was pasted | Select **everything** in `schema.sql` with `Ctrl`/`Cmd` + `A`, paste the lot, and Run again. |
| I can see somebody else's projects | Should be impossible — RLS is not switched on | Stop and re-run `supabase/schema.sql`. If it persists, do not put real data in until it is resolved. |
| Google sign-in button does nothing at all | Provider not enabled in Supabase | **Step F4.** Check the Google toggle is on and you clicked **Save**. |

---

## Final checklist

- [ ] Supabase account and project created
- [ ] **Database password saved somewhere safe**
- [ ] Project URL copied down
- [ ] anon / public key copied down
- [ ] `service_role` key left well alone
- [ ] `schema.sql` run, and a **projects** table visible in Table Editor
- [ ] `.env.local` created on my computer with both `NEXT_PUBLIC_…` values
- [ ] Both variables added in Vercel **and the site redeployed**
- [ ] Email provider enabled
- [ ] Google Cloud project created and consent screen filled in
- [ ] Redirect URI in Google = `https://<project-ref>.supabase.co/auth/v1/callback`
- [ ] Google Client ID and Secret pasted into Supabase and saved
- [ ] Site URL set, and Redirect URLs added for **both** localhost and the live site
- [ ] Signed in successfully with email
- [ ] Signed in successfully with Google
- [ ] Saved a test project and can see the row in Table Editor

---

## A note on your data

With this setup in place:

- Every project row is stamped with the ID of the person who created it.
- The database itself — not just the app — refuses to hand back a row to anyone
  other than its owner. That rule is enforced in Supabase, so it holds even if
  someone tampers with the website code in their own browser.
- Delete a user account and their projects are deleted with it.

If you ever want to see everything stored for a user, Supabase's **Table Editor** shows
it plainly. Nothing is hidden from you.
