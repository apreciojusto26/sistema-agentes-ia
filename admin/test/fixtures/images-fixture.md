# `--images` fixture (`admin/test/fixtures/images/`)

Nine 1x1 JPEGs, one per template asset slot that
`admin/test/fixtures/minimal-content.json` references.

## Why this directory exists

`contract.generate-landing.test.ts` has asserted the `copy-images` stage since
`c8a15aa` (the commit that added the admin dashboard), pointing `--images` at
this path — but the directory itself was **never committed**. Verified against
history, not just HEAD: `git log --all -- 'admin/test/fixtures/images*'` returns
nothing. It is not gitignored either; only `scraper/images/` is. So the test has
been red on every clean checkout since the day it was written, failing with
`✗ --images directory not found` and exit 1.

`--images` is a live feature, not dead weight: `admin/src/server/jobs/runner.ts`
passes it from `params.imagesDir` on real pipeline runs, and
`admin/src/shared/events.ts` documents `copy-images` as the stage it emits.

## Why these exact filenames

The legacy (no `--product`) path in `generate-landing.mjs` copies a source file
only when its **bare name already exists** in the template's
`src/assets/product/` — it never creates new, unregistered asset keys. These
nine names are exactly the slots minimal-content.json declares, and they match
`TEMPLATE_SLOT_KEYS` in `scripts/lib/asset-pipeline.mjs`.

The videos and the video poster are deliberately absent: the fixture covers the
image path, and a real .mp4 would add a binary to the repo for no assertion.

## Why this file lives OUTSIDE the directory

`copyImagesByName()` reports every file in `--images` whose bare name has no
match in the template as unmatched, so a README inside the fixture made a real
run print

    - 1 file(s) in --images had no matching filename in src/assets/product/: README.md

A fixture that makes correct runs emit a spurious warning is a bad fixture.

## Why real JPEGs

`copyImagesByName()` stats and sha256s every file it copies, and the generated
landing is then built against them. A zero-byte placeholder with a `.jpg`
extension would pass the copy and fail the build, which is a worse test than no
test.
