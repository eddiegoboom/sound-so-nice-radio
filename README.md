# Sound So Nice Radio website

A one-page static site. A player lists every episode found in the CFRU archive folder, and a Google Sheet (optional) adds titles, themes, hosts, guests and descriptions. No server, no build tools.

```
public/                  <- the website (this folder is what gets published)
  index.html style.css app.js
  config.js              <- paste your Google Sheet links here
  episodes.json          <- list of archive files (auto-refreshed hourly)
  content/*.csv          <- built-in defaults / templates for the sheet tabs
scripts/fetch_episodes.py  <- reads the archive folder, writes episodes.json
.github/workflows/pages.yml <- hourly build + deploy to GitHub Pages
```

## How it works

1. **Every hour** a GitHub Action reads <https://archive.cfru.ca/show/name/Sound%20So%20Nice/>, writes `episodes.json`, and deploys the site. New files appear automatically, with the default title "2026-11-21 - Live".
2. **When a visitor loads the page**, it reads your Google Sheet live and layers titles/themes/hosts/guests/descriptions on top of the archive files. Sheet edits show up on the next page load (Google may cache published sheets for a few minutes).
3. If the sheet is unreachable the site falls back to the last copy the browser saw, then to `public/content/*.csv`.

## Search and filters

Above the episode list, visitors can search (title, theme, hosts, guests, DJ mix, description, date) and filter by **Host**, **Guest** and **DJ mix**. The dropdowns fill themselves from whatever names appear in the sheet, and a dropdown is hidden if nobody is listed for it yet. Clicking a name chip on the now-playing panel filters to that person. Previous/next and auto-advance follow the filtered list.

## Latest episode and long lists

The newest episode is tagged **Latest** in the list and in the player. The list shows the 10 newest episodes with a **Show more** button for 10 more at a time. Searching or filtering searches every episode, and opening a link to an older episode expands the list to include it.

## Share a moment

The player has a **Copy link at 0:00** button that copies a link to the current episode at the current playback time, like `https://yoursite/#20261121-2100&t=1h12m30s`. Opening it selects that episode and jumps to the time. Browsers often block sound until the visitor interacts, so they may need to press Play once. `t` also accepts plain seconds (`t=4350`).

## Set up the Google Sheet (about 10 minutes)

1. Create a new Google Sheet with **three tabs** named `Settings`, `Social`, `Playlist`.
2. In each tab: *File > Import > Upload* the matching file from `public/content/` (`settings.csv`, `social.csv`, `playlist.csv`), choosing **Replace current sheet**.
3. **Format the `date` and `time` columns in Playlist as Plain text** (*Format > Number > Plain text*) so Sheets doesn't reformat them. Dates are `YYYY-MM-DD`; times are 24-hour like `21:00` (`9pm` also works).
4. For **each tab**: *File > Share > Publish to web*, choose that tab and **Comma-separated values (.csv)**, click Publish, and copy the link.
5. Paste the three links into `public/config.js`, commit, and push.

Only the published tabs are public; the sheet itself stays private to you and your editors.

### Playlist columns

| Column | Notes |
|---|---|
| `date` | `YYYY-MM-DD`, the air date from the archive filename. The only required column |
| `time` | Optional. Only needed to pick one episode when there are several that day. See below |
| `title` | Optional. See "How titles are built" below |
| `theme` | Optional. Comma-separated if there is more than one ("Jazz, Winter") |
| `hosts`, `guests`, `dj_mix` | Comma-separated names. Blank hosts = `default_hosts` from Settings. `dj_mix` is who did the mix at the end of the show. Spelling matters for filtering, but capitalization doesn't ("dj kay" = "DJ Kay") |
| `mix_themes` | Optional. Comma-separated themes/keywords for the DJ mix. Shown in brackets after the DJ Mix item ("DJ Mix by Eddie Go Boom (Dub, Roots)") and searchable |
| `in_this_show` | Optional. Comma-separated segments **in running order**, shown as a numbered timeline in the now-playing panel (1 Feature, 2 Hot In The Crates, …). An item named `DJ Mix` becomes "DJ Mix by [dj_mix]" plus the mix themes. The Apps Script pre-fills new rows with `Feature, Hot In The Crates, Canadian Spotlight, DJ Mix`. Blank = `default_in_show` from Settings (same list) |
| `description` | Optional. Line breaks are kept |
| `image` | Optional. Link used for lock-screen artwork on phones |
| `mp3_url` | Optional. Only for an episode that is **not** in the archive folder (a full link) |
| `visible` | `FALSE` hides the episode. Blank/`TRUE` shows it |

Every column except `date` is optional; anything left blank uses the default.

**How titles are built** (date is always first):

| You enter | Title shown |
|---|---|
| nothing | `2026-11-21 - Live` |
| title `Autumn Mix` | `2026-11-21 - Autumn Mix` |
| theme `Jazz, Winter` | `2026-11-21 - Jazz, Winter` |
| title and theme | `2026-11-21 - Autumn Mix (Jazz, Winter)` |
| guests `Sam, Alex` (added to any of the above) | `2026-11-21 - Live (w/ Sam, Alex)` |

That full title is used in the episode list. The now-playing panel shows a shorter title (`[date] - [title]`, just `[date]` when there is a theme but no title, or `[date] - Live` when there is neither) and puts the theme and guests on their own lines below it.

Any day with more than one episode ends with ` - Part 1`, ` - Part 2`, and so on in time order, whether or not the sheet has a row for that day (`2026-06-20 - Live - Part 1`). This applies however the sheet rows for that day are written.

Under each episode's title the site shows `Hosts: … · Mix by: … (mix themes)` in the episode list (guests are listed with the hosts; leaving out whatever is blank). The now-playing panel still shows Hosts, Guests and Mix by separately.

**Several episodes on one date:**
- A row with only a **date** applies to every episode that day.
- A row with a **date and time** (e.g. `21:00`), or an `mp3_url` that is that episode's file, applies to just that episode. Timed rows are matched first, so a date-only row covers whichever episodes that day don't have their own row.
- Either way, the episodes are labelled **Part 1, Part 2, …** in time order (e.g. `2026-08-29 - Live - Part 1`, or `Your Title - Part 1`).

**Not sure what to enter?** Open the site with `?admin` on the end (e.g. `https://yoursite/?admin`). It lists every archive file with its date, time, and whether a sheet row matched, plus any problems with your rows.

### Settings keys

| Key | What it does |
|---|---|
| `site_title` | Browser tab title. Shown as text only if the logo can't load |
| `tagline` | Short line under the logo |
| `show_description` | The quick show description, shown under the logo. Leave blank to hide it. Line breaks are kept |
| `schedule_text` | When the show airs, shown under the description (built-in default: "Live every Saturday, 9–10 pm ET on CFRU 93.3 FM"). Blank = hidden |
| `listen_live_url` | Where the "Listen live" link after the airtime goes (default `https://listen.cfru.ca`, CFRU's live stream). Blank = no link |
| `about` | Optional longer "About" section near the bottom. Blank = hidden |
| `logo_url` | Optional. Blank uses the bundled `public/assets/logo.jpg` |
| `default_hosts` | Hosts used for any episode that doesn't list its own |
| `default_in_show` | "In this show" items used for any episode whose `in_this_show` is blank. Built-in default: `Feature, Hot In The Crates, Canadian Spotlight, DJ Mix` |
| `submit_email` | Email address for artist submissions. Shows an "Email us your track" button that opens a pre-filled message. Blank = no email button |
| `submit_form_url` | Link to a form (for example a Google Form) for artist submissions. Shows a "Submit a track" button. Blank = no form button |
| `submit_text` | The sentence above the submission buttons. The whole "Submit your music" section stays hidden until `submit_email` or `submit_form_url` is set |
| `footer_text`, `footer_link_label`, `footer_link_url` | The footer line and its link |

Unknown keys are ignored (so an old `accent_color` or `episode_title_prefix` row does nothing and can be deleted).

## Design

Minimal, with a nod to reggae sound-system culture: a black "speaker box" player with speaker-cone rings, a red/gold/green stripe, and condensed poster lettering (Bebas Neue, self-hosted from `public/fonts/` under the SIL Open Font License). The page follows the visitor's light/dark setting. The colors and fonts live at the top of `public/style.css`. To swap the logo, replace `public/assets/logo.jpg` (the bundled one is only 150 px wide, so a larger file will look sharper on high-resolution screens).

### Social tab

`label`, `url`, `order`. The shipped rows point at each platform's home page. **Replace them with the real profile links.**

## Keep the sheet filled automatically (optional)

The site already lists every episode in the archive folder, with or without a sheet row. This script is a convenience for editors: every hour it adds a row for each new episode (with `date`, `time` and `mp3_url` filled in) and keeps the Playlist tab in date order, so you can see what still needs details. It never deletes rows or overwrites what you've typed.

1. Open the Google Sheet, then **Extensions > Apps Script**.
2. Replace the contents of the editor with `scripts/sheet-sync.gs` from this repo and click **Save**.
3. Pick **installHourlyTrigger** in the function drop-down and click **Run**. Google asks you to authorize the script. Because it's your own script you'll see an "unverified app" warning: choose *Advanced > Go to (project name)* and allow it. This sets up the hourly check.
4. Pick **syncEpisodes** and click **Run** once to fill in all existing dates straight away. After that, a "Sound So Nice" menu appears in the sheet for running it by hand.

Things to know:
- It adds **one row per episode**, so a day with several episodes gets several rows. They show on the site as Part 1, Part 2, ... in time order.
- **Sorting:** newest date first, and earlier episodes first within a day. It re-sorts every hour and whenever the sheet is opened (menu: *Sound So Nice > Sort by date now*). It doesn't re-sort while you type, so a row won't jump away mid-edit. To flip to oldest-first, change `NEWEST_FIRST` at the top of the script to `false`.
- **Existing rows are respected.** If a date already has a **date-only** row (no time), that row covers every episode that day and nothing is added for it. If a date has timed rows, only the missing episodes are added.
- **Tidying:** to sort correctly, any `date` or `time` cell that Sheets turned into a real date/time (or that you typed as `8/29/2026` or `9pm`) is rewritten as plain text (`2026-08-29`, `21:00`). Formulas are never touched.
- Don't **delete** a row to hide an episode, because the script will add it back. Set `visible` to `FALSE` instead.
- The script belongs to the one spreadsheet. If you make a copy of the sheet, run `installHourlyTrigger` again in the copy, because triggers don't copy over.

## Deploy on GitHub Pages

1. Create a GitHub repository and push this folder to the `main` branch.
2. On GitHub: **Settings > Pages > Build and deployment > Source: GitHub Actions**.
3. Open the **Actions** tab, pick *Build and deploy site*, and click **Run workflow** for the first deploy. The site URL appears in the run summary.
4. After that it redeploys on every push and every hour. To pick up a brand-new episode immediately, click **Run workflow** again.

A custom domain can be added under Settings > Pages.

## Run locally

**Easiest:** double-click `preview.bat`. It refreshes the episode list, starts a local server, and opens <http://localhost:8000> in your browser. Close the window (or press Ctrl+C) to stop. Add `/?admin` to the address for the admin view.

Or by hand:

```
python scripts/fetch_episodes.py        # refresh public/episodes.json
cd public
python -m http.server 8000              # then open http://localhost:8000
```

(Opening `index.html` by double-click won't work, because browsers block `fetch()` on `file://` pages.)

## Notes

- Times are shown as written in the filename (EST/EDT); no time-zone conversion is done.
- Episodes play straight from the CFRU archive, so listeners use CFRU's bandwidth, not yours.
- If the archive can't be reached during a build, the previously committed `episodes.json` is used and the rest of the site still deploys.
