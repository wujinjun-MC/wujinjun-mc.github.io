# Repository guidance

## Purpose and current state

- This repository is the owner's personal résumé / portfolio site, intended for `https://wujinjun-mc.github.io/`.
- Git remote: `https://github.com/wujinjun-MC/wujinjun-mc.github.io`.
- The site is adapted from `happysnaker/Resume`. Preserve applicable attribution, `LICENSE`, and `THIRD_PARTY_NOTICES.md`.
- It is a static site: HTML, CSS, JavaScript, and bundled frontend libraries. There is no package manifest, build step, automated test suite, or deployment workflow checked in. GitHub Pages settings are outside this repository and have not been verified.
- `README.md` records plans for résumé, blog, and CSI205 use. Treat unchecked goals as plans, not implemented features.

## File map

- `index.html`: page structure, metadata/title, navigation, hardcoded hero links and fallback introduction, contact UI, footer, script loading, and analytics snippets.
- `config/config.js`: global `var config` containing profile details, introduction, mottos, skills, project cards, work entries, highlights, social links, and image paths. This is executable JavaScript, not JSON.
- `JS/personal-info-main.js`: loads the config using `document.write`, renders it with jQuery, animates mottos and skill bars, and handles the email button.
- `CSS/personal-info-main.css` and `CSS/personal-info-animate.css`: custom layout, responsive styling, and effects.
- `JS/app.js`: particles.js setup. AOS and other bundled libraries provide additional animations.
- `images/` and `svg/`: local image and social-icon assets.
- `.github/SUPPORT.md` and `.github/ISSUE_TEMPLATE/config.yml`: inherited upstream support and issue-routing material; these do not establish the owner's services or payment details.

## Editing conventions

- Prefer small edits to the existing static implementation. Do not introduce a framework, package manager, or build pipeline unless the task requires it.
- Keep the exact capitalization of `JS/`, `CSS/`, and asset filenames; hosted paths are case-sensitive. Prefer relative local asset URLs.
- Edit profile content in `config/config.js`, but also inspect hardcoded content in `index.html` for consistency. The document title and hero action links are not populated from config.
- Preserve config keys and tuple ordering unless updating every consuming location. Some names are inherited and do not match their visible labels:

  | Config key | Visible meaning |
  | --- | --- |
  | `name` | Name |
  | `sex` | Focus |
  | `age` | Location |
  | `phone` | GitHub link |
  | `email` | Email address and mailto recipient |
  | `address` | Site link |
  | `qq` | Support content |
  | `log` | Navbar brand |
  | `expected_work` | Open to |

- Tuple shapes: `skills` = `[label, percentage, color]`; `portfolio` = `[image, URL, title, description]`; `work` and `others` = `[date, title, description]`; `icon` = `[image, URL, tooltip]`.
- `url` image order is hero background, avatar, projects background, highlights background.
- Many config values are inserted as HTML through `.html()` or string concatenation. Keep markup well formed and use trusted, repository-controlled content. Keep `email` a plain address because the contact handler uses it directly.
- Preserve script dependency order: jQuery before Bootstrap and the renderer; particles.js before `JS/app.js`; AOS before `AOS.init()`. Account for the renderer's current config-loading behavior when changing scripts.
- Keep edits to custom files where possible. Avoid hand-editing bundled/minified libraries; preserve their license headers when an update is necessary.
- Maintain responsive behavior, readable text, meaningful link labels and image alternatives, and usable keyboard navigation when changing the UI.
- The contact form opens the visitor's email client with `mailto:`; it has no backend delivery service.
- Analytics snippets live in `index.html`: Google Analytics and a Fathom tracker on an external host. Their ownership and operation are unverified; do not replace tracking identifiers or add tracking as part of unrelated edits.

## Content findings and guardrails

These observations describe the checked-in content, not verified facts about the owner:

- Name, email, focus, location, navbar brand, and many links still use placeholders such as `Example Name`, `example_name`, `example@example.com`, `?`, and `...`.
- The title says `Example User | DS & AI`, while the hero and much of the config describe backend / systems engineering. Confirm the intended positioning before harmonizing them.
- Project links, social links, and hardcoded hero buttons contain example destinations. Work entries include detailed contribution claims that must be confirmed before presenting them as the owner's experience.
- Highlights contain example tasks. Do not invent achievements, employers, dates, qualifications, contact information, or proficiency values to fill gaps.
- Support/review promotions remain in the HTML and GitHub metadata. The `qq` value also contains mismatched `<strong>` / `</a>` markup. These are review items, not evidence that the owner offers paid reviews or accepts donations.
- Use owner-provided or otherwise verified information for résumé updates. Clearly report missing facts rather than inferring them from template text or the account name.

## Local preview and validation

- Serve the repository root with `python3 -m http.server 8000`, then open `http://localhost:8000/`. Stop the server when finished.
- There are no dependency-install or build commands to run. For JavaScript edits, use available syntax checks such as `node --check config/config.js`, `node --check JS/personal-info-main.js`, and `node --check JS/app.js` for the files touched.
- For page/content changes, preview desktop and mobile widths. Check the navbar, section anchors, profile rendering, images, project cards, timeline, animations, and contact behavior as relevant. Check the console and network panel for script errors and missing local assets.
- Review placeholder occurrences with `rg -n 'Example|example_name|example\.com|example@example\.com' index.html config/config.js`; assess matches in context rather than replacing them indiscriminately.
- Run `git diff --check` and review the final diff. Documentation-only edits do not require UI tests.
- Report what was actually checked and any remaining limitations. A local preview does not verify external link availability, analytics delivery, GitHub Pages configuration, or email delivery.
