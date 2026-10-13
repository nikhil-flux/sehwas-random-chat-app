# Sehwas

Free random video chat (Omegle-style). Dark UI, WebRTC video, Node.js + Socket.IO matching server, built-in SEO bot and a CI/CD pipeline. Everything runs on free tiers.

## How it works

```
Browser A  <---- video/audio (WebRTC, peer-to-peer) ---->  Browser B
    \                                                       /
     \--- Socket.IO (pairing, handshake, chat) --- server.js ---/
```

The server only pairs two waiting users and relays the WebRTC handshake and text chat. It never sees or stores video.

## Project layout

| File | Purpose |
|---|---|
| `server.js` | Express + Socket.IO server, matching, report/blocking |
| `public/index.html` | Landing page, chat screen, FAQ, SEO tags |
| `public/style.css` | Dark theme |
| `public/app.js` | Camera, WebRTC, buttons |
| `public/terms.html` | Terms, privacy, safety |
| `public/sitemap.xml`, `public/robots.txt` | SEO files (`%SITE_URL%` is filled in by the server) |
| `seo/seo-bot.js` | SEO audit, sitemap refresh, IndexNow ping |
| `seo/config.json` | Your live site address |
| `test/smoke.js` | Automated end-to-end check |
| `.github/workflows/ci.yml` | Test on every push, deploy on main |
| `.github/workflows/seo.yml` | Weekly SEO bot |
| `.github/dependabot.yml` | Weekly dependency update pull requests |
| `render.yaml` | Render hosting config |

## Play with friends (private rooms)

Press **Invite a friend**. The invite link (`/?r=abc123`) is copied for you. Anyone who opens it joins the same private room and is matched only with people using that link. Press **Start video chat** instead to meet random people.

## Run locally

```bash
npm install
npm start          # http://localhost:3000, open in two tabs and allow the camera
npm test           # matching, signaling and chat checks
npm run seo        # SEO audit and sitemap refresh
```

After the first `npm install`, commit the generated `package-lock.json`.

## Push to GitHub

Create an empty repo named `sehwas` on github.com/new, then:

```bash
git init
git add .
git commit -m "Sehwas first version"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/sehwas.git
git push -u origin main
```

## Deploy free on Render

1. render.com > sign in with GitHub > New > Web Service > pick the repo.
2. Build `npm install`, Start `npm start`, Instance type Free.
3. Open the service > Environment and optionally add `SITE_URL`, `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` (see `.env.example`).

The free plan sleeps after about 15 minutes without visitors and takes up to a minute to wake.

## Updating the site (CI/CD pipeline)

Day to day you only do this:

```bash
git add .
git commit -m "Describe your change"
git push
```

Then GitHub Actions (`.github/workflows/ci.yml`) does the rest:

1. **Test** job installs dependencies and runs `npm test` and the SEO audit.
2. **Deploy** job runs only on `main` and only if tests pass. It calls your Render deploy hook.

To enable the deploy job: Render > your service > Settings > Deploy Hook > copy the URL, then GitHub > repo > Settings > Secrets and variables > Actions > New repository secret named `RENDER_DEPLOY_HOOK`.

Simpler alternative: leave the secret out and in Render set Auto-Deploy to "After CI Checks Pass". Use one or the other, not both, or every push deploys twice.

Dependabot opens a pull request each week when a dependency has an update. If CI is green, merge it.

Work safely with branches:

```bash
git checkout -b my-change
# edit files, then
git add . && git commit -m "My change" && git push -u origin my-change
```

Open a pull request on GitHub. CI tests it, then you merge it into `main` to go live.

## SEO

1. Put your live address in `seo/config.json` and add a GitHub repository variable `SITE_URL` (Settings > Secrets and variables > Actions > Variables).
2. Add the site to Google Search Console, verify it, submit `/sitemap.xml`, and use URL inspection > Request indexing on the home page.
3. `.github/workflows/seo.yml` audits pages, refreshes the sitemap and pings IndexNow (Bing, Yandex) every Monday. Google ignores IndexNow.

Indexing takes days to weeks and no ranking is guaranteed.

## Safety

18+ gate, Report button with automatic one-hour blocking after 3 reports, no video stored, Terms page. Edit the contact line in `public/terms.html` before launch. Blocks are by IP and are kept in memory, so they reset when the server restarts. Consider adding moderation as you grow and check the laws where you live.

## Troubleshooting

- **Camera does not start:** allow it in the browser address bar. It needs `localhost` or HTTPS.
- **Black remote video for some users:** add a TURN server (see `.env.example`).
- **First load is slow on Render:** the free plan was asleep.
- **CI fails on `npm ci`:** commit `package-lock.json` after running `npm install` once.