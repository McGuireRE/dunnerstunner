# Builds onboarding/index.html from the files in this folder. Run: python3 onboarding/src/build.py
# It also writes the portal (Tim's own pages, with an address for each page):
#   onboarding/portal.js  the same app as index.html in one script (styles, page markup and code), for the portal shell
#   portal/index.html     the portal shell, served at packages.dunnerstunner.co.nz/portal/
#   404.html              the same shell at the root: GitHub Pages serves it for any missing address, so a deep portal
#                         address such as /portal/properties/<id> opens the portal; any other missing address says "not found"
# The shell is the same file for portal.dunnerstunner.co.nz (copy it there as index.html and 404.html, with a CNAME).
import base64, json, os
here = os.path.dirname(os.path.abspath(__file__))
read = lambda f: open(os.path.join(here, f)).read()
css, body, js = read('styles.html'), read('body.html'), read('app.js')
strings, i18n, repo = read('strings.js'), read('i18n.js'), read('repo-core.js')
offers, qr, draft = read('offers-core.js'), read('qr.js'), read('draft-core.js')
for k, f in [('__LOGO_LIGHT__', 'logo-light.png'), ('__LOGO_DARK__', 'logo-dark.png')]:
    body = body.replace(k, 'data:image/png;base64,' + base64.b64encode(open(os.path.join(here, f), 'rb').read()).decode())
html = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Your agency agreement · McGuire Real Estate</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet">
{css}
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>
<script src="../catalogue.js"></script>
</head>
<body>
{body}
<script>
{strings}
</script>
<script>
{i18n}
</script>
<script>
{repo}
</script>
<script>
{offers}
</script>
<script>
{qr}
</script>
<script>
{draft}
</script>
<script>
{js}
</script>
</body>
</html>
'''
root = os.path.normpath(os.path.join(here, '..', '..'))
out = os.path.join(here, '..', 'index.html')
open(out, 'w').write(html)
print('built', os.path.normpath(out), len(html), 'bytes')

# The portal bundle: the styles and page markup go in first, then each script runs as its own script element, in the same
# order as index.html, so the app behaves the same. It runs only after the shell has said it is the portal (window.MRE_PORTAL).
parts = [strings, i18n, repo, offers, qr, draft, js]
bundle = ('/* McGuire Real Estate portal: built by onboarding/src/build.py from onboarding/src. Do not edit by hand. */\n'
          '(function () {\n'
          '  if (!window.MRE_PORTAL) return;\n'
          f'  document.head.insertAdjacentHTML("beforeend", {json.dumps(css)});\n'
          f'  document.body.insertAdjacentHTML("afterbegin", {json.dumps(body)});\n'
          f'  var parts = {json.dumps(parts)};\n'
          '  parts.forEach(function (t) { var s = document.createElement("script"); s.textContent = t; document.body.appendChild(s); });\n'
          '})();\n')
bout = os.path.join(here, '..', 'portal.js')
open(bout, 'w').write(bundle)
print('built', os.path.normpath(bout), len(bundle), 'bytes')

# The shell. Its script and styles come from absolute packages.dunnerstunner.co.nz addresses, so the same file works at
# /portal/ here, at any depth below it (a relative address would break at /portal/properties/<id>), and at the root of
# portal.dunnerstunner.co.nz. It is the portal only on portal.dunnerstunner.co.nz or under /portal/; anywhere else (this
# file is also the 404 page of packages.dunnerstunner.co.nz) it just says the page isn't there. Its raw title is "Page not found",
# so a link preview of a missing address never says "Portal"; the portal title is set only once it knows it is the portal.
shell = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Page not found</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  html { color-scheme: light dark; }
  body { margin: 0; font-family: Barlow, system-ui, sans-serif; background: #FAF8F5; color: #1A1A18; }
  @media (prefers-color-scheme: dark) { body { background: #181716; color: #F2EEE9; } }
  .shell-msg { max-width: 440px; margin: 12vh auto 0; padding: 0 16px; font-size: 17px; line-height: 1.5; }
  .shell-msg h1 { font-family: "Cormorant Garamond", Georgia, serif; font-weight: 500; font-size: 34px; margin: 0 0 10px; }
  .shell-msg a { color: inherit; }
</style>
</head>
<body>
<noscript><div class="shell-msg"><h1>Please switch on JavaScript</h1><p>This page needs JavaScript to run.</p></div></noscript>
<script>
(function () {
  var host = location.hostname, path = location.pathname;
  var portal = host.indexOf('portal.') === 0 || /^\\/portal(\\/|$)/.test(path);
  if (!portal) {
    document.body.insertAdjacentHTML('beforeend', '<div class="shell-msg"><h1>Page not found</h1><p>There is no page at this address.</p><p><a href="/">Go to the home page</a></p></div>');
    return;
  }
  window.MRE_PORTAL = true;
  document.title = 'Portal · McGuire Real Estate';
  var failed = false;
  var fail = function () { if (failed) return; failed = true; document.body.insertAdjacentHTML('beforeend', '<div class="shell-msg" id="shellFail"><h1>Something went wrong</h1><p>The portal could not load. Check your connection and try again.</p><p><a href="">Try again</a></p></div>'); };
  var src = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js',
    'https://packages.dunnerstunner.co.nz/catalogue.js',
    'https://packages.dunnerstunner.co.nz/onboarding/portal.js'];
  src.forEach(function (s) { var e = document.createElement('script'); e.src = s; e.async = false; e.onerror = fail; document.body.appendChild(e); });
})();
</script>
</body>
</html>
'''
os.makedirs(os.path.join(root, 'portal'), exist_ok=True)
for f in [os.path.join(root, 'portal', 'index.html'), os.path.join(root, '404.html')]:
    open(f, 'w').write(shell)
    print('built', os.path.normpath(f), len(shell), 'bytes')
