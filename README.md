# Office Ledger — shared team calendar

A lightweight, no-login calendar your officemates can open in a browser to
add, view, and color-code shared agendas (meetings, leave, deadlines, etc.)
in Month / Week / Day views. No build tools — plain HTML/CSS/JS, hosted
free on GitHub Pages, synced live through a free Firebase project.

## 1. Create your Firebase project (5 minutes, free)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in with any Google account.
2. Click **Add project**, give it a name (e.g. `office-ledger`), and finish the wizard (you can disable Google Analytics, it's not needed).
3. In the left sidebar, go to **Build → Firestore Database → Create database**.
   - Choose a location close to your office.
   - Start in **test mode** for now (see the security note below).
4. In the left sidebar, click the gear icon → **Project settings**. Scroll to **Your apps**, click the **</>** (web) icon, register the app (any nickname), and skip the Firebase Hosting step.
5. Copy the `firebaseConfig` object shown — you'll need it next.

## 2. Connect the app to your project

Open `js/firebase-config.js` and replace the placeholder values with the
ones from your `firebaseConfig` object:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

Save the file. That's the only code change needed.

## 3. Try it locally

Just open `index.html` in a browser — no server or build step required.
(If your browser blocks local file scripts, run `python3 -m http.server`
in this folder and visit `http://localhost:8000`.)

## 4. Push to GitHub and turn on GitHub Pages

```bash
git init
git add .
git commit -m "Office Ledger calendar"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

Then in your GitHub repo: **Settings → Pages → Source → Deploy from branch**,
pick `main` and `/ (root)`. After a minute your calendar will be live at
`https://YOUR-USERNAME.github.io/YOUR-REPO/` — share that link with your
officemates.

## 5. Secure your database (recommended before wide sharing)

Test mode allows anyone with your Firebase config (visible in your public
GitHub repo!) to read and write. That's fine for a small trusted office
tool, but if you want a bit more safety, go to **Firestore Database →
Rules** and use something like:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /events/{eventId} {
      allow read: if true;
      allow write: if request.resource.data.title is string
                   && request.resource.data.title.size() < 200;
    }
  }
}
```

This still allows anyone with the link to add/edit entries (no login
system is built in) but adds basic validation. If you later want real
per-person accounts, Firebase Authentication can be added on top.

## How it works

- **Sidebar** — switch between Monthly / Weekly / Daily views, jump to
  today, see the color legend (built automatically from the "category"
  label you set on each entry), and set your display name (remembered in
  your browser, used to tag entries you add).
- **+ New Entry** — click it, or click any day/time slot in the calendar,
  to open the entry form: title, date, start/end time, notes, a category
  label, and a color.
- **Legend** — fills in automatically: every unique category label you've
  used shows up with its color swatch. Give me your official color legend
  whenever you're ready and I can hard-code fixed categories/colors
  instead of the free-text version.
- **Live sync** — every entry is stored in Firestore, so all officemates
  see additions/edits/deletions in real time without refreshing.

## Categories & colors

Each entry is tagged with one of five fixed categories, each with its own
color, shown in the sidebar legend:

| Category | Color |
|---|---|
| TO (Travel Order) | Steel blue |
| SO/MO (Special Order/Memo) | Plum |
| ABSENT | Brick red |
| LEAVE | Sage green |
| PASS SLIP | Mustard |

Each entry has: a title, date, category, and optional list of people
involved — no start/end time.

## Customizing

- Categories and their colors: edit the `CATEGORIES` array at the top of
  `js/app.js`.
- Visual style (fonts, colors, spacing): `css/style.css`, all values are
  defined as CSS variables at the top of the file.
