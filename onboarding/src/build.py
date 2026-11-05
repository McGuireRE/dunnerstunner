# Builds onboarding/index.html from the files in this folder. Run: python3 onboarding/src/build.py
import base64, os
here = os.path.dirname(os.path.abspath(__file__))
read = lambda f: open(os.path.join(here, f)).read()
css, body, js = read('styles.html'), read('body.html'), read('app.js')
for k, f in [('__LOGO_LIGHT__', 'logo-light.png'), ('__LOGO_DARK__', 'logo-dark.png')]:
    body = body.replace(k, 'data:image/png;base64,' + base64.b64encode(open(os.path.join(here, f), 'rb').read()).decode())
html = f'''<!doctype html>
<html lang="en-NZ">
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
{js}
</script>
</body>
</html>
'''
out = os.path.join(here, '..', 'index.html')
open(out, 'w').write(html)
print('built', os.path.normpath(out), len(html), 'bytes')
