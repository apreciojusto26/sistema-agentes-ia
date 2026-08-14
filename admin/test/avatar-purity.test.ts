// Static Per-Agent Avatars contract (spec "Static Per-Agent Avatars", design
// §2 + §9.1) — REVISED: avatars moved from inline `currentColor` SVG to real
// image assets (public/{extractor,copys,constructor}.png) per user reference
// mock. The purity guarantee that mattered — an avatar is structurally
// incapable of reading job/liveness state, D1a — is now even stronger: a
// plain `avatarSrc: string` on AGENT_IDENTITY cannot accept a `job` prop at
// all, there's no component to smuggle one into.
//
// Asserts:
//   1. every AgentIdentity has a non-empty avatarSrc starting with `/`
//   2. the referenced file actually exists under src/client/public/ (Vite's
//      real publicDir, given `root: 'src/client'` in vite.config.ts — NOT
//      the repo-root `public/`, which Vite never serves)
//   3. no two identities share an avatar file
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { AGENT_IDENTITY } from '../src/client/components/agent-identity';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../src/client/public');

describe('avatar-purity (spec Static Per-Agent Avatars, design §2/§9.1 — image-based revision)', () => {
  const identities = Object.values(AGENT_IDENTITY);

  it('every identity has a non-empty avatarSrc rooted at "/"', () => {
    for (const identity of identities) {
      expect(identity.avatarSrc, `${identity.id} has an empty avatarSrc`).toBeTruthy();
      expect(identity.avatarSrc.startsWith('/'), `${identity.id}.avatarSrc must be root-relative: ${identity.avatarSrc}`).toBe(
        true,
      );
    }
  });

  it('every avatarSrc resolves to a real file under src/client/public/', () => {
    for (const identity of identities) {
      const full = path.join(PUBLIC_DIR, identity.avatarSrc);
      expect(existsSync(full), `${identity.id}.avatarSrc (${identity.avatarSrc}) does not exist at ${full}`).toBe(true);
    }
  });

  it('no two identities share the same avatar file', () => {
    const sources = identities.map((identity) => identity.avatarSrc);
    expect(new Set(sources).size).toBe(sources.length);
  });
});
