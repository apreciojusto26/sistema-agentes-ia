// One module owns the avatar<->accent<->name<->tagline binding (design
// §6.1), so the sidebar and the panel header can never disagree.
//
// Avatars are real image assets (public/{extractor,copys,constructor}.png)
// rather than inline SVG — see test/avatar-purity.test.ts for the contract
// this implies (identity -> file must exist, one image per identity, no two
// identities sharing a file).
//
// GOTCHA (design §11 judgment call #12 — binding): the accent class strings
// below MUST stay whole literals. Tailwind 4's Oxide scanner reads source
// TEXT statically — `` `text-agent-${id}` `` produces no CSS and the app
// silently renders colorless with zero build errors. Never interpolate an
// accent class anywhere in this change.

export type AgentIdentityId = 'scrape' | 'content' | 'generate';

export type AgentIdentity = {
  id: AgentIdentityId;
  avatarSrc: string;
  name: string;
  tagline: string;
  accentText: string;
  accentTint: string;
  accentBorder: string;
};

export const AGENT_IDENTITY: Record<AgentIdentityId, AgentIdentity> = {
  scrape: {
    id: 'scrape',
    avatarSrc: '/extractor.png',
    name: 'Extractor de productos',
    tagline: 'Entra a la página del producto y trae fotos, precios y reseñas.',
    accentText: 'text-agent-scrape',
    accentTint: 'bg-agent-scrape-tint',
    accentBorder: 'border-agent-scrape',
  },
  content: {
    id: 'content',
    avatarSrc: '/copys.png',
    name: 'Textos y diseño',
    tagline: 'Escribe los textos de tu landing con IA. Si preferís, los pegás vos a mano.',
    accentText: 'text-agent-content',
    accentTint: 'bg-agent-content-tint',
    accentBorder: 'border-agent-content',
  },
  generate: {
    id: 'generate',
    avatarSrc: '/constructor.png',
    name: 'Constructor de la landing',
    tagline: 'Arma la carpeta final de tu landing con los textos y las fotos.',
    accentText: 'text-agent-generate',
    accentTint: 'bg-agent-generate-tint',
    accentBorder: 'border-agent-generate',
  },
};
