# Agent instructions

Keep this file and any linked agent instructions in English.

## Netlify previews

- The production branch is `main`. The Netlify site name is `artisticlaudia`.
- When a user wants to review site changes before production, make the changes on a separate branch, push that branch to `origin`, and open a pull request targeting `main`. A branch push alone does not guarantee a Netlify Deploy Preview.
- Use a draft pull request while the changes are being reviewed. If the work already has an open preview pull request, update its branch instead of opening a duplicate.
- Netlify's expected preview URL is `https://deploy-preview-<PR number>--artisticlaudia.netlify.app/`. Check the actual link on the pull request and verify that the deploy has completed and serves the intended content before reporting that the preview is ready.
- Share both the pull request and preview URLs with the user. Keep `main` untouched until the user asks to merge.

## Publishing boundary

- `public/` contains browser assets; `npm run build` generates `dist/`, which Netlify publishes. Keep server code, Apps Script, documentation, credentials, and temporary files out of `public/`.
- Stage only files related to the requested change. Do not include unrelated untracked files or generated output in preview commits.

## Animation guidance

- The repository includes the iart.ai Web Animation Skills in `.agents/skills/`. Read the relevant `SKILL.md` before changing site animations, especially `accessible-animation` and `60fps-animation` for scroll and entrance effects.
- Adapt examples to this site's plain JavaScript and CSS. Respect `prefers-reduced-motion`, keep content visible without animation, and check the result on mobile and desktop.
- Skill files are agent guidance, not browser assets or runtime dependencies. Keep them outside `public/` and `dist/`.

## UI redesign guidance

- For visual redesign work, read `.agents/skills/taste-skill/SKILL.md` and adapt its design guidance to this site's existing plain HTML, CSS, and JavaScript stack.
- Preserve the current commission flow, content, cloud media, and accessibility while reviewing changes through the draft preview pull request.
