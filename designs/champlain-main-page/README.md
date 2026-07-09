# Champlain Group — Main Page redesign (green/gold preserved)

Three paste-ready pieces. Install in this order:

## 1. `MediaWiki-Common.css`
Paste the whole file into the page **`MediaWiki:Common.css`** on your wiki
(create it if it doesn't exist — requires admin/interface rights).
All classes are prefixed `cg-`, so nothing else on the wiki is affected.

**One edit needed:** in `.cg-hero`, replace `url(/images/Hero_Nebula.jpg)` with the
real path of your nebula banner image (open the file's page on the wiki, right-click
the image → copy image address, use the path portion). If the image is missing,
a solid green fallback keeps the hero presentable.

## 2. `Template-CG-NavCard.wiki`
Create the page **`Template:CG-NavCard`** and paste the file's contents.
This is the reusable contents card — adding an eighth section later is one
`{{CG-NavCard | ... }}` line, and every card stays the same size automatically
(images are uniformly cropped to 130 px tall).

## 3. `MainPage.wiki`
Paste into your **Main Page** (edit source). Then swap the placeholder image
names (`Orion Arm Card.jpg`, etc.) for your actual uploaded card images, and
replace the `...` social URLs with your real profile links.

## What changed, briefly
- Intro text moved off the nebula image onto a solid panel; the hero keeps the
  banner with a dark scrim so the title stays readable (contrast fix).
- One emblem instead of two; shorter hero, content above the fold.
- Contents is a uniform, responsive card grid via the template — titles and
  one-line descriptions make navigation self-explanatory.
- Bulletin text appears once (not in the graphic *and* below it); one clear
  "Read the full story" button; social links demoted to a small footer row.
- Accessibility: alt text on every image, logical heading structure, bright
  gold links (AA contrast on the green — the default red fails), softened
  red-link color, visible focus outlines, reduced-motion respected.

## Two things CSS alone can't fix
- **Mobile:** your skin outputs `<meta name="viewport" content="width=1000">`,
  which forces desktop layout on phones and blocks the responsive grid there.
  Fix it in the skin's header template (change to
  `width=device-width, initial-scale=1`) or install the MobileFrontend extension.
- **Site name:** "My wiki:About" is the default `$wgSitename`. Set
  `$wgSitename = "Champlain Group Wiki";` in `LocalSettings.php`.
