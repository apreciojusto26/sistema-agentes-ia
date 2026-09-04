// THE ONE declaration of which template this repo generates from.
//
// WHY A SHARED MODULE. The path was declared TWICE and the copies had already
// drifted in intent: admin/src/server/config.ts named it for the preview
// server's node_modules symlink and the health check, while
// scripts/generate-landing.mjs kept its own constant — and only that second
// one ever governed a copy. Changing the admin constant alone would have moved
// the health check and left every generated landing coming out of the other
// template, silently.
//
// This repo is Fixed AstraVibe: every generated product is the SAME PAGE with
// different data in it, so the source of that page is not a preference. It is
// the premise, and admin/test/contract.fixed-template.test.ts pins it with a
// mutation case that fails if the value moves back.
//
// content/landing-base still EXISTS and is still read by the Design System
// contract suites, which inspect it as source. That is deliberate and is not a
// contradiction: those tests inspect a directory, they do not generate from
// one. Nothing in the Fixed runtime path may resolve to it.

/** Directory name under content/ that every Fixed generation copies from. */
export const FIXED_TEMPLATE_NAME = 'landing-astravibe';

/** The Version A template. Named ONLY so the guard can assert it is unused. */
export const EXPERIMENTAL_TEMPLATE_NAME = 'landing-base';

/** Repo-relative path, for log lines, manifests and error messages. */
export const FIXED_TEMPLATE_RELATIVE = `content/${FIXED_TEMPLATE_NAME}`;
