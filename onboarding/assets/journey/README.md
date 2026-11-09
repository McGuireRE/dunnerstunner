# Photos and videos for the journey pages

The journey pages have empty slots where a photo or a video can go. Nothing shows until you fill a slot, and an empty slot is
invisible to sellers. To see where media could go, open any journey page with `?media=preview` on the end, for example
`https://packages.dunnerstunner.co.nz/onboarding/#journey/meeting-tim?media=preview`. Every empty slot then shows as a dashed box
with a suggestion for what would suit it. Only you will see that; sellers never do.

## Photos

1. Put the photo in this folder (`onboarding/assets/journey/`). Use a short plain name with no spaces, for example `tim-front-door.jpg`.
2. Make it about 1600 pixels wide and under 300 KB, so it loads quickly on a phone. JPG or WebP is best.
3. In `onboarding/src/strings.js`, find `window.JOURNEY_MEDIA`, then the stop (for example `'meeting-tim'`) and the slot:
   `hero` sits under the page title, and each name under `points` (for example `'happens.my-fee'`) shows inside that point when it opens.
4. Replace `null` with the details, for example:
   `{ type: 'image', src: 'tim-front-door.jpg', alt: 'Tim at the front door of a property in Dunedin', credit: 'Photo: Tim McGuire', width: 1600, height: 1067 }`
5. Alt text and a credit are both required. A photo without either is left out. Alt text is one plain sentence that says what the photo
   shows, for people who cannot see it.
6. Only use photos you have the rights to: your own, or ones you have paid for or been given written permission to use.
   Say who took it in the credit.

## Videos

Only YouTube and Vimeo links work. Use `{ type: 'video', src: 'https://www.youtube.com/watch?v=...', title: 'Tim explains the cooling-off period', credit: 'Video: Tim McGuire' }`.
Nothing is loaded from YouTube or Vimeo until a seller taps play, and then the privacy-friendly player is used. A still image can
be added as `poster: 'file-name.jpg'` (a photo in this folder). Captions are a good idea: switch them on in YouTube or Vimeo.
On paper, a video prints as its title and link.

## After you change something

Ask Claude to rebuild the page and run the tests, then it goes live in the usual way.
