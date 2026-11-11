# GitHub presentation assets

These assets belong to the bilingual project README and repository social preview.
They do not change the application theme or demonstrate real student records.

## Brand artwork

- `cove-art.png`: AI-generated background, PinAI `gpt-image-2`, generated 2026-11-11. Requested 1536 × 1024, high quality; returned 1672 × 941 RGB PNG.
- `cove-banner.png`: 1600 × 720 README banner.
- `cove-social.png`: 1280 × 640 GitHub social preview, below 1 MB.

The background contains no lettering. The title and tagline are typeset separately with Pillow, using Arial when available and DejaVu Sans otherwise. Font substitution can change pixels. Rebuild from the repository root with Python 3 and Pillow installed:

```bash
python3 scripts/build-github-art.py
```

This command does not call an image API. Keep the original background so the layouts can be regenerated without another generation request. Do not save API keys, provider responses or account details here. The artwork does not establish an overall software license for this repository.

Generation prompt:

> Editorial brand artwork for Cove, a quiet personal campus information workspace. Wide horizontal composition with entire LEFT HALF nearly empty warm ivory #F7F4EB, negative space for typography. RIGHT HALF elegant sheltered cove formed by smooth layered dark forest-green paper contours, pale mint shoreline, calm soft blue water. Four ivory paper sheets drift along separate curved paths and gather, representing notices/coursework/discussion/feedback. Tactile paper sculpture, subtle grain, Swiss editorial direction, diffused daylight, clean shapes, whitespace. Palette #1F5546 #F7F4EB #B7D9CD #B8D5E8 tiny vermilion accent. No people/buildings/boats/logos/text/fake UI/neon.

## Product screenshots

`screenshots/{brief,grades,ed,ontrack}.png` are 1440 × 1080 captures of the production Web App with fixed anonymous demonstration DTOs. Course codes, scores, task content and feedback are invented. They are actual UI captures, not AI-generated mockups or real-account verification.

After building `local-service` and `webapp`, capture them from the repository root:

```bash
node webapp/e2e/capture-readme.mjs
```

The script uses the installed Google Chrome, a random local port, temporary database and secret/config stores, fixed time, mocked reads and blocked external network access. It closes the browser/server and removes temporary state on exit. Do not point it at a running user service or replace its fixtures with account data. Review all four images and both READMEs whenever the UI or fixtures change.

## References

Layout research used [GitHub CLI](https://github.com/cli/cli) for early screenshots and concise installation, and [Unicorn](https://github.com/TuuHub/unicorn) for a compact branded entry point. No reference artwork or README prose was copied. Keep product boundaries explicit; the separate Unicorn memory layer is not required to run the local app.
