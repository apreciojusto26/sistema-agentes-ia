# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

See `_shared/skill-resolver.md` for the full resolution protocol.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| Writing Go tests, using teatest, or adding test coverage | go-testing | ~/.claude/skills/go-testing/SKILL.md |
| Creating a new skill, adding agent instructions, documenting patterns for AI | skill-creator | ~/.claude/skills/skill-creator/SKILL.md |
| Creating a pull request, opening a PR, preparing changes for review | branch-pr | ~/.claude/skills/branch-pr/SKILL.md |
| Creating a GitHub issue, reporting a bug, requesting a feature | issue-creation | ~/.claude/skills/issue-creation/SKILL.md |
| "judgment day", "judgment-day", "review adversarial", "dual review", "doble review", "juzgar", "que lo juzguen" | judgment-day | ~/.claude/skills/judgment-day/SKILL.md |
| Editing video by conversation — transcribe, cut, grade, overlays, subtitles | video-use | ~/.claude/skills/video-use/SKILL.md (symlink -> /Users/gbritez/Desktop/dev/video-use) |

Note: no project-level skill directories exist yet (`.claude/skills/`, `.gemini/skills/`, `.agent/skills/`, `skills/` were all checked — none found at project root). None of the above skills directly match this project's stack (Astro/React/TS/Tailwind); they apply only if their trigger context arises (e.g. opening a PR, creating an issue, building a skill).

## Compact Rules

Pre-digested rules per skill. Delegators copy matching blocks into sub-agent prompts as `## Project Standards (auto-resolved)`.

### go-testing
- Table-driven tests for pure functions: struct slice `{name, input, expected, wantErr}` + `t.Run` per case
- Bubbletea: test `Model.Update()` directly for state transitions; use `teatest.NewTestModel` for full interactive flows
- Golden file testing for `View()` output comparisons (`testdata/*.golden`, `-update` flag to regenerate)
- Use `t.TempDir()` for file operation tests; mock `os/exec` via interfaces, not real commands (unless `-short`-skippable integration test)
- Commands: `go test ./...`, `go test -cover ./...`, `go test -short ./...`

### skill-creator
- Skill dir: `SKILL.md` (required) + optional `assets/` (templates/schemas) + `references/` (local doc links only, never web URLs)
- Frontmatter required: `name`, `description` (must include explicit "Trigger:" clause), `license: Apache-2.0`, `metadata.author`, `metadata.version`
- Naming: `{technology}` generic, `{project}-{component}` project-specific, `{project}-test-{component}` testing, `{action}-{target}` workflow
- Don't add a Keywords section — agent searches frontmatter/description, not body
- Keep code examples minimal; no lengthy explanations or troubleshooting sections — link to docs instead
- Register the new skill in `AGENTS.md` after creating it

### branch-pr
- Every PR MUST link an approved issue (`Closes/Fixes/Resolves #N`); linked issue MUST already carry `status:approved`
- Every PR MUST carry exactly one `type:*` label matching the commit type
- Branch names MUST match `^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)\/[a-z0-9._-]+$`
- Commits MUST be conventional-commit format; NEVER add `Co-Authored-By` trailers
- Run `shellcheck` on any modified shell scripts before opening the PR
- PR body must include: linked issue, one checked type, summary, changes table, test plan, contributor checklist

### issue-creation
- Blank issues are disabled — MUST use `bug_report.yml` or `feature_request.yml` template
- New issues auto-get `status:needs-review`; a maintainer must add `status:approved` before any PR can reference it
- Questions go to GitHub Discussions, never filed as issues
- Bug reports require: pre-flight checks, description, repro steps, expected/actual behavior, OS, agent/client, shell
- Feature requests require: pre-flight checks, problem description, proposed solution, affected area

### judgment-day
- Resolve the skill registry (engram or `.atl/skill-registry.md`) BEFORE launching judges; inject compact rules into both judge prompts and the fix-agent prompt
- Launch exactly TWO blind judge sub-agents in parallel (async), same target, no cross-contamination; orchestrator never reviews itself
- Orchestrator (not a sub-agent) synthesizes verdicts: Confirmed (both agree) / Suspect A / Suspect B / Contradiction
- Classify every WARNING as real (triggerable by normal usage — fix required) vs theoretical (needs contrived input — report only, don't block)
- Fix confirmed CRITICALs/real WARNINGs via a separate Fix Agent, then re-launch both judges fresh; escalate to the user after 2 iterations without convergence

### video-use
- Subtitles applied LAST in the filter chain, after every overlay — otherwise overlays hide captions
- Extract per-segment then lossless `-c copy` concat, never a single-pass filtergraph
- 30ms audio fades at every segment boundary (`afade` in/out) to avoid audible pops
- Overlays use `setpts=PTS-STARTPTS+T/TB` so the overlay's frame 0 aligns to its window start
- Never cut inside a word — snap cuts to word boundaries from the transcript; pad edges 30-200ms
- Word-level verbatim ASR only (never SRT/phrase mode); cache transcripts per source, never re-transcribe unless the source changed
- Parallel sub-agents for multiple animations, never sequential
- Strategy confirmation required before touching the cut; all session outputs go to `<videos_dir>/edit/`, never inside the `video-use/` project directory

## Project Conventions

| File | Path | Notes |
|------|------|-------|
| claude.MD | claude.MD | Root orchestration spec: goal, hard rules (never touch component logic/hooks/tracking/checkout), input/output spec JSON, transformation rules, constraints. **Contains stale paths** — see discrepancies in `sdd-init/landing-generator` engram entry (`/base-template`, `/outputs/{slug}`, `tailwind.config.ts` do not exist in reality). |
| agents.MD | agents.MD | Defines 5 agents (Content, Design, Layout, Code, Scraping) with strict JSON input/output contracts and a fixed execution order. Code Agent steps reference the same stale `/base-template` → `/outputs/{slug}` paths as claude.MD. |

Neither file is an "index" that references other convention files by path — both are standalone rule documents, read in full above. `~/.claude/CLAUDE.md` (global, personal) is intentionally excluded from this table per the skill-registry convention (project-level only).

Read the convention files listed above for project-specific patterns and rules.
