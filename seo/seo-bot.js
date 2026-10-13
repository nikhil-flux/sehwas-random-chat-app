'use strict';
// Simple SEO audit + sitemap refresh. Usage: node seo/seo-bot.js [--ping]
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const site = (process.env.SITE_URL || cfg.siteUrl || '').replace(/\/+$/, '');
let problems = 0;
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'WARN'} - ${msg}`); if (!cond) problems++; };

const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
check(/<title>[^<]{10,70}<\/title>/.test(html), 'title present and a sensible length');
check(/<meta name="description" content="[^"]{50,170}"/.test(html), 'meta description present');
check(html.includes('rel="canonical"'), 'canonical link present');
check(html.includes('application/ld+json'), 'structured data present');
check((html.match(/<h1[ >]/g) || []).length === 1, 'exactly one h1');
check(!!site && !site.includes('YOUR-SITE-URL'), 'siteUrl is set (config.json or SITE_URL env)');

// refresh lastmod in sitemap
const smPath = path.join(root, 'public/sitemap.xml');
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(smPath, fs.readFileSync(smPath, 'utf8').replace(/<lastmod>[^<]*<\/lastmod>/g, `<lastmod>${today}</lastmod>`));
console.log(`ok   - sitemap lastmod set to ${today}`);

(async () => {
  if (process.argv.includes('--ping') && site && !site.includes('YOUR-SITE-URL')) {
    try {
      const host = new URL(site).host;
      const r = await fetch(`https://api.indexnow.org/indexnow?url=${encodeURIComponent(site + '/')}&key=${host}`);
      console.log('IndexNow ping status', r.status);
    } catch (e) { console.log('ping skipped:', e.message); }
  }
  console.log(problems ? `\n${problems} SEO warning(s) (not fatal)` : '\nSEO audit clean');
})();
