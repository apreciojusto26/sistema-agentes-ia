// THE ASTRAVIBE FIXED STRUCTURAL GRAMMAR — the declarative authority.
//
// This is what "still AstraVibe" means, stated once. `structuralFingerprint`
// is a general tool; this module is the contract it is pointed at.
//
// ─── WHY IT IS DECLARATIVE ────────────────────────────────────────────────
//
// The shapes below were TRANSCRIBED from real renders, never hand-written, but
// they are frozen here rather than discovered at validation time. A validator
// that re-derived the grammar from the page it is checking would agree with
// every page, including a broken one. The bootstrap tooling that produced this
// file is research equipment; the authority is the file.
//
// ─── WHERE EACH SHAPE CAME FROM ───────────────────────────────────────────
//
// Two sources, because builds alone are not enough. A landing build only
// materializes the states its product happens to be in — the commerce fixture
// shows five of VariantPicker's eight. So combinatorial regions take their
// shapes from the COMPONENT, rendered in every state the state models prove
// reachable (VariantPicker.states.test.ts, BundleSelector.states.test.ts), and
// the rest come from the preview and commerce builds.
//
// ─── STATES vs SHAPES ─────────────────────────────────────────────────────
//
// These are not the same count, and the difference is not a discrepancy.
// VariantPicker has EIGHT reachable states and SIX distinct structural shapes:
// the skeleton drops text, so two pairs of states that differ only in words
// collapse. The state model proves reachability; the grammar declares what the
// fingerprint can actually see.
//
// ─── HOW TO CHANGE IT ─────────────────────────────────────────────────────
//
// Not by regenerating until a test passes. A shape appearing here must be a
// shape some component demonstrably renders, and a legitimate structural
// change is a new grammar VERSION, never a silent update to this one.

export const FIXED_GRAMMAR = [
  {
    id: "utility/ticker",
    wrapper: {"tag":"div","classes":["animate-marquee"]},
    kind: 'repeat',
    min: 1,
    zero: "optional-capability",
    shapes: [
      { name: 'S01', skeleton: "<span class=\"text-white/80 whitespace-nowrap\">" },
    ],
  },
  {
    id: "hero/dots",
    wrapper: {"tag":"div","attrs":{"role":"tablist"},"classes":["absolute","bottom-3"]},
    kind: 'repeat',
    min: 1,
    zero: "invalid-input",
    shapes: [
      { name: 'S01', skeleton: "<button aria-label aria-selected=\"false\" class=\"bg-white/40 rounded-full size-2 transition-colors\" role=\"tab\" type=\"button\">" },
      { name: 'S02', skeleton: "<button aria-label aria-selected=\"true\" class=\"bg-white rounded-full size-2 transition-colors\" role=\"tab\" type=\"button\">" },
    ],
  },
  {
    id: "buy/variants",
    wrapper: {"tag":"div","classes":["grid-cols-3","grid"]},
    kind: 'repeat',
    min: 1,
    zero: "profile-requirement",
    shapes: [
      { name: 'S01', skeleton: "<label class=\"border-2 border-graphite/10 cursor-not-allowed flex flex-col font-semibold has-[:checked]:bg-grape-tint has-[:checked]:border-grape has-[:checked]:text-grape items-center justify-center min-w-0 opacity-50 px-1.5 py-2 relative rounded-pill sm:px-3 text-center text-graphite text-sm transition\">\n  <input aria-disabled=\"true\" class=\"peer sr-only\" disabled name=\"<radio-group-1>\" type=\"radio\" value>\n  <span class=\"line-through whitespace-nowrap\">\n  <span class=\"font-normal text-steel text-xs\">" },
      { name: 'S02', skeleton: "<label class=\"border-2 border-graphite/10 cursor-not-allowed flex flex-col font-semibold has-[:checked]:bg-grape-tint has-[:checked]:border-grape has-[:checked]:text-grape items-center justify-center min-w-0 opacity-50 px-1.5 py-2 relative rounded-pill sm:px-3 text-center text-graphite text-sm transition\">\n  <span class=\"-top-2.5 -translate-x-1/2 absolute bg-amber-600 font-black left-1/2 px-2 py-0.5 rounded-pill shadow-card sm:text-[0.625rem] text-[0.5625rem] text-white tracking-wider uppercase whitespace-nowrap\">\n  <input aria-disabled=\"true\" class=\"peer sr-only\" disabled name=\"<radio-group-1>\" type=\"radio\" value>\n  <span class=\"line-through whitespace-nowrap\">\n  <span class=\"font-normal text-steel text-xs\">" },
      { name: 'S03', skeleton: "<label class=\"border-2 border-graphite/10 cursor-pointer flex flex-col font-semibold has-[:checked]:bg-grape-tint has-[:checked]:border-grape has-[:checked]:text-grape items-center justify-center min-w-0 px-1.5 py-2 relative rounded-pill sm:px-3 text-center text-graphite text-sm transition\">\n  <input aria-disabled=\"false\" checked class=\"peer sr-only\" name=\"<radio-group-1>\" type=\"radio\" value>\n  <span class=\"whitespace-nowrap\">" },
      { name: 'S04', skeleton: "<label class=\"border-2 border-graphite/10 cursor-pointer flex flex-col font-semibold has-[:checked]:bg-grape-tint has-[:checked]:border-grape has-[:checked]:text-grape items-center justify-center min-w-0 px-1.5 py-2 relative rounded-pill sm:px-3 text-center text-graphite text-sm transition\">\n  <input aria-disabled=\"false\" class=\"peer sr-only\" name=\"<radio-group-1>\" type=\"radio\" value>\n  <span class=\"whitespace-nowrap\">" },
      { name: 'S05', skeleton: "<label class=\"border-2 border-graphite/10 cursor-pointer flex flex-col font-semibold has-[:checked]:bg-grape-tint has-[:checked]:border-grape has-[:checked]:text-grape items-center justify-center min-w-0 px-1.5 py-2 relative rounded-pill sm:px-3 text-center text-graphite text-sm transition\">\n  <span class=\"-top-2.5 -translate-x-1/2 absolute bg-amber-600 font-black left-1/2 px-2 py-0.5 rounded-pill shadow-card sm:text-[0.625rem] text-[0.5625rem] text-white tracking-wider uppercase whitespace-nowrap\">\n  <input aria-disabled=\"false\" checked class=\"peer sr-only\" name=\"<radio-group-1>\" type=\"radio\" value>\n  <span class=\"whitespace-nowrap\">" },
      { name: 'S06', skeleton: "<label class=\"border-2 border-graphite/10 cursor-pointer flex flex-col font-semibold has-[:checked]:bg-grape-tint has-[:checked]:border-grape has-[:checked]:text-grape items-center justify-center min-w-0 px-1.5 py-2 relative rounded-pill sm:px-3 text-center text-graphite text-sm transition\">\n  <span class=\"-top-2.5 -translate-x-1/2 absolute bg-amber-600 font-black left-1/2 px-2 py-0.5 rounded-pill shadow-card sm:text-[0.625rem] text-[0.5625rem] text-white tracking-wider uppercase whitespace-nowrap\">\n  <input aria-disabled=\"false\" class=\"peer sr-only\" name=\"<radio-group-1>\" type=\"radio\" value>\n  <span class=\"whitespace-nowrap\">" },
    ],
  },
  {
    id: "buy/packs",
    wrapper: {"tag":"div","attrs":{"role":"radiogroup"},"classes":["space-y-3"]},
    kind: 'repeat',
    min: 1,
    zero: "invalid-input",
    shapes: [
      { name: 'S01', skeleton: "<label class=\"bg-white border-2 border-graphite/10 flex gap-3 has-[:checked]:bg-grape-tint has-[:checked]:border-grape has-[:checked]:shadow-lift items-center p-4 relative rounded-tile transition\">\n  <input checked class=\"peer sr-only\" name=\"<radio-group-2>\" type=\"radio\" value>\n  <span aria-hidden=\"true\" class=\"border-2 border-steel-light peer-checked:border-[6px] peer-checked:border-grape rounded-full shrink-0 size-5\">\n  <span class=\"flex-1\">\n    <span class=\"block font-bold font-display text-graphite\">\n    <span class=\"block text-steel text-xs\">\n  <span class=\"text-right\">\n    <span class=\"block font-black font-display tabular-nums text-graphite\">" },
      { name: 'S02', skeleton: "<label class=\"bg-white border-2 border-graphite/10 flex gap-3 has-[:checked]:bg-grape-tint has-[:checked]:border-grape has-[:checked]:shadow-lift items-center p-4 relative rounded-tile transition\">\n  <input checked class=\"peer sr-only\" name=\"<radio-group-2>\" type=\"radio\" value>\n  <span aria-hidden=\"true\" class=\"border-2 border-steel-light peer-checked:border-[6px] peer-checked:border-grape rounded-full shrink-0 size-5\">\n  <span class=\"flex-1\">\n    <span class=\"block font-bold font-display text-graphite\">\n    <span class=\"block text-steel text-xs\">\n  <span class=\"text-right\">\n    <span class=\"block font-black font-display tabular-nums text-graphite\">\n    <span class=\"block line-through tabular-nums text-steel text-xs\">" },
      { name: 'S03', skeleton: "<label class=\"bg-white border-2 border-graphite/10 flex gap-3 has-[:checked]:bg-grape-tint has-[:checked]:border-grape has-[:checked]:shadow-lift items-center p-4 relative rounded-tile transition\">\n  <input checked class=\"peer sr-only\" name=\"<radio-group-2>\" type=\"radio\" value>\n  <span aria-hidden=\"true\" class=\"border-2 border-steel-light peer-checked:border-[6px] peer-checked:border-grape rounded-full shrink-0 size-5\">\n  <span class=\"flex-1\">\n    <span class=\"block font-bold font-display text-graphite\">\n  <span class=\"text-right\">\n    <span class=\"block font-black font-display tabular-nums text-graphite\">" },
      { name: 'S04', skeleton: "<label class=\"bg-white border-2 border-graphite/10 flex gap-3 has-[:checked]:bg-grape-tint has-[:checked]:border-grape has-[:checked]:shadow-lift items-center p-4 relative rounded-tile transition\">\n  <input checked class=\"peer sr-only\" name=\"<radio-group-2>\" type=\"radio\" value>\n  <span aria-hidden=\"true\" class=\"border-2 border-steel-light peer-checked:border-[6px] peer-checked:border-grape rounded-full shrink-0 size-5\">\n  <span class=\"flex-1\">\n    <span class=\"block font-bold font-display text-graphite\">\n  <span class=\"text-right\">\n    <span class=\"block font-black font-display tabular-nums text-graphite\">\n    <span class=\"block line-through tabular-nums text-steel text-xs\">" },
      { name: 'S05', skeleton: "<label class=\"bg-white border-2 border-graphite/10 flex gap-3 has-[:checked]:bg-grape-tint has-[:checked]:border-grape has-[:checked]:shadow-lift items-center p-4 relative rounded-tile transition\">\n  <input class=\"peer sr-only\" name=\"<radio-group-2>\" type=\"radio\" value>\n  <span aria-hidden=\"true\" class=\"border-2 border-steel-light peer-checked:border-[6px] peer-checked:border-grape rounded-full shrink-0 size-5\">\n  <span class=\"flex-1\">\n    <span class=\"block font-bold font-display text-graphite\">\n    <span class=\"block font-semibold text-steel text-xs\">\n  <span class=\"text-right\">\n    <span class=\"block font-black font-display tabular-nums text-graphite\">\n    <span class=\"block line-through tabular-nums text-steel text-xs\">" },
      { name: 'S06', skeleton: "<label class=\"bg-white border-2 border-graphite/10 flex gap-3 has-[:checked]:bg-grape-tint has-[:checked]:border-grape has-[:checked]:shadow-lift items-center p-4 relative rounded-tile transition\">\n  <input class=\"peer sr-only\" name=\"<radio-group-2>\" type=\"radio\" value>\n  <span aria-hidden=\"true\" class=\"border-2 border-steel-light peer-checked:border-[6px] peer-checked:border-grape rounded-full shrink-0 size-5\">\n  <span class=\"flex-1\">\n    <span class=\"block font-bold font-display text-graphite\">\n    <span class=\"block text-steel text-xs\">\n  <span class=\"text-right\">\n    <span class=\"block font-black font-display tabular-nums text-graphite\">" },
      { name: 'S07', skeleton: "<label class=\"bg-white border-2 border-graphite/10 flex gap-3 has-[:checked]:bg-grape-tint has-[:checked]:border-grape has-[:checked]:shadow-lift items-center p-4 relative rounded-tile transition\">\n  <input class=\"peer sr-only\" name=\"<radio-group-2>\" type=\"radio\" value>\n  <span aria-hidden=\"true\" class=\"border-2 border-steel-light peer-checked:border-[6px] peer-checked:border-grape rounded-full shrink-0 size-5\">\n  <span class=\"flex-1\">\n    <span class=\"block font-bold font-display text-graphite\">\n  <span class=\"text-right\">\n    <span class=\"block font-black font-display tabular-nums text-graphite\">" },
      { name: 'S08', skeleton: "<label class=\"bg-white border-2 border-graphite/10 flex gap-3 has-[:checked]:bg-grape-tint has-[:checked]:border-grape has-[:checked]:shadow-lift items-center p-4 relative rounded-tile transition\">\n  <input class=\"peer sr-only\" name=\"<radio-group-2>\" type=\"radio\" value>\n  <span aria-hidden=\"true\" class=\"border-2 border-steel-light peer-checked:border-[6px] peer-checked:border-grape rounded-full shrink-0 size-5\">\n  <span class=\"flex-1\">\n    <span class=\"block font-bold font-display text-graphite\">\n  <span class=\"text-right\">\n    <span class=\"block font-black font-display tabular-nums text-graphite\">\n    <span class=\"block line-through tabular-nums text-steel text-xs\">" },
      { name: 'S09', skeleton: "<label class=\"bg-white border-2 border-graphite/10 flex gap-3 has-[:checked]:bg-grape-tint has-[:checked]:border-grape has-[:checked]:shadow-lift items-center p-4 relative rounded-tile transition\">\n  <span class=\"-top-2.5 absolute bg-amber-600 font-black left-4 px-2.5 py-0.5 rounded-pill shadow-card text-[0.625rem] text-white tracking-widest\">\n  <input checked class=\"peer sr-only\" name=\"<radio-group-2>\" type=\"radio\" value>\n  <span aria-hidden=\"true\" class=\"border-2 border-steel-light peer-checked:border-[6px] peer-checked:border-grape rounded-full shrink-0 size-5\">\n  <span class=\"flex-1\">\n    <span class=\"block font-bold font-display text-graphite\">\n    <span class=\"block font-semibold text-steel text-xs\">\n  <span class=\"text-right\">\n    <span class=\"block font-black font-display tabular-nums text-graphite\">\n    <span class=\"block line-through tabular-nums text-steel text-xs\">" },
      { name: 'S10', skeleton: "<label class=\"bg-white border-2 border-graphite/10 flex gap-3 has-[:checked]:bg-grape-tint has-[:checked]:border-grape has-[:checked]:shadow-lift items-center p-4 relative rounded-tile transition\">\n  <span class=\"-top-2.5 absolute bg-amber-600 font-black left-4 px-2.5 py-0.5 rounded-pill shadow-card text-[0.625rem] text-white tracking-widest\">\n  <input checked class=\"peer sr-only\" name=\"<radio-group-2>\" type=\"radio\" value>\n  <span aria-hidden=\"true\" class=\"border-2 border-steel-light peer-checked:border-[6px] peer-checked:border-grape rounded-full shrink-0 size-5\">\n  <span class=\"flex-1\">\n    <span class=\"block font-bold font-display text-graphite\">\n    <span class=\"block text-steel text-xs\">\n  <span class=\"text-right\">\n    <span class=\"block font-black font-display tabular-nums text-graphite\">" },
      { name: 'S11', skeleton: "<label class=\"bg-white border-2 border-graphite/10 flex gap-3 has-[:checked]:bg-grape-tint has-[:checked]:border-grape has-[:checked]:shadow-lift items-center p-4 relative rounded-tile transition\">\n  <span class=\"-top-2.5 absolute bg-amber-600 font-black left-4 px-2.5 py-0.5 rounded-pill shadow-card text-[0.625rem] text-white tracking-widest\">\n  <input checked class=\"peer sr-only\" name=\"<radio-group-2>\" type=\"radio\" value>\n  <span aria-hidden=\"true\" class=\"border-2 border-steel-light peer-checked:border-[6px] peer-checked:border-grape rounded-full shrink-0 size-5\">\n  <span class=\"flex-1\">\n    <span class=\"block font-bold font-display text-graphite\">\n  <span class=\"text-right\">\n    <span class=\"block font-black font-display tabular-nums text-graphite\">" },
      { name: 'S12', skeleton: "<label class=\"bg-white border-2 border-graphite/10 flex gap-3 has-[:checked]:bg-grape-tint has-[:checked]:border-grape has-[:checked]:shadow-lift items-center p-4 relative rounded-tile transition\">\n  <span class=\"-top-2.5 absolute bg-amber-600 font-black left-4 px-2.5 py-0.5 rounded-pill shadow-card text-[0.625rem] text-white tracking-widest\">\n  <input class=\"peer sr-only\" name=\"<radio-group-2>\" type=\"radio\" value>\n  <span aria-hidden=\"true\" class=\"border-2 border-steel-light peer-checked:border-[6px] peer-checked:border-grape rounded-full shrink-0 size-5\">\n  <span class=\"flex-1\">\n    <span class=\"block font-bold font-display text-graphite\">\n    <span class=\"block font-semibold text-steel text-xs\">\n  <span class=\"text-right\">\n    <span class=\"block font-black font-display tabular-nums text-graphite\">\n    <span class=\"block line-through tabular-nums text-steel text-xs\">" },
      { name: 'S13', skeleton: "<label class=\"bg-white border-2 border-graphite/10 flex gap-3 has-[:checked]:bg-grape-tint has-[:checked]:border-grape has-[:checked]:shadow-lift items-center p-4 relative rounded-tile transition\">\n  <span class=\"-top-2.5 absolute bg-amber-600 font-black left-4 px-2.5 py-0.5 rounded-pill shadow-card text-[0.625rem] text-white tracking-widest\">\n  <input class=\"peer sr-only\" name=\"<radio-group-2>\" type=\"radio\" value>\n  <span aria-hidden=\"true\" class=\"border-2 border-steel-light peer-checked:border-[6px] peer-checked:border-grape rounded-full shrink-0 size-5\">\n  <span class=\"flex-1\">\n    <span class=\"block font-bold font-display text-graphite\">\n    <span class=\"block text-steel text-xs\">\n  <span class=\"text-right\">\n    <span class=\"block font-black font-display tabular-nums text-graphite\">" },
      { name: 'S14', skeleton: "<label class=\"bg-white border-2 border-graphite/10 flex gap-3 has-[:checked]:bg-grape-tint has-[:checked]:border-grape has-[:checked]:shadow-lift items-center p-4 relative rounded-tile transition\">\n  <span class=\"-top-2.5 absolute bg-amber-600 font-black left-4 px-2.5 py-0.5 rounded-pill shadow-card text-[0.625rem] text-white tracking-widest\">\n  <input class=\"peer sr-only\" name=\"<radio-group-2>\" type=\"radio\" value>\n  <span aria-hidden=\"true\" class=\"border-2 border-steel-light peer-checked:border-[6px] peer-checked:border-grape rounded-full shrink-0 size-5\">\n  <span class=\"flex-1\">\n    <span class=\"block font-bold font-display text-graphite\">\n  <span class=\"text-right\">\n    <span class=\"block font-black font-display tabular-nums text-graphite\">" },
    ],
  },
  {
    id: "howitworks/cards",
    wrapper: {"tag":"div","classes":["snap-mandatory","gap-3"]},
    kind: 'repeat',
    min: 1,
    zero: "invalid-input",
    shapes: [
      { name: 'S01', skeleton: "<div class=\"flex flex-col last:mr-5 md:bg-surface md:block md:last:mr-0 md:overflow-hidden md:shadow-[0_14px_28px_-10px_rgb(30_33_36_/_0.32)] md:w-auto rounded-card shrink-0 snap-start w-[calc(87%_-_2.175rem)]\" data-step-card>\n  <div class=\"md:rounded-none overflow-hidden relative rounded-t-card\">\n    <MEDIA class=\"aspect-[4/3] h-full object-cover rounded-none w-full w-full\" height=\"<media/intrinsic-height>\" src srcset style=\"aspect-ratio:4 / 3\" width=\"<media/intrinsic-width>\">\n    <span class=\"absolute bg-graphite font-black font-display grid left-4 place-items-center rounded-full size-9 text-bone top-4\">\n  <div class=\"[clip-path:inset(0_-30px_-30px)] bg-surface flex-1 md:[clip-path:none] md:rounded-none md:shadow-none p-5 rounded-b-card shadow-[0_10px_25px_rgb(30_33_36_/_0.10)]\">\n    <h3 class=\"font-bold text-graphite text-lg\">\n    <p class=\"mt-1 text-sm text-steel\">" },
      { name: 'S02', skeleton: "<div class=\"flex flex-col last:mr-5 md:bg-surface md:block md:last:mr-0 md:overflow-hidden md:shadow-[0_14px_28px_-10px_rgb(30_33_36_/_0.32)] md:w-auto rounded-card shrink-0 snap-start w-[calc(87%_-_2.175rem)]\" data-step-card>\n  <div class=\"md:rounded-none overflow-hidden relative rounded-t-card\">\n    <MEDIA class=\"aspect-[4/3] h-full object-cover rounded-none w-full w-full\" src style=\"aspect-ratio:4 / 3\">\n    <span class=\"absolute bg-graphite font-black font-display grid left-4 place-items-center rounded-full size-9 text-bone top-4\">\n  <div class=\"[clip-path:inset(0_-30px_-30px)] bg-surface flex-1 md:[clip-path:none] md:rounded-none md:shadow-none p-5 rounded-b-card shadow-[0_10px_25px_rgb(30_33_36_/_0.10)]\">\n    <h3 class=\"font-bold text-graphite text-lg\">\n    <p class=\"mt-1 text-sm text-steel\">" },
      { name: 'S03', skeleton: "<span aria-hidden=\"true\" class=\"-mr-3 md:hidden shrink-0 snap-start w-5\">" },
    ],
  },
  {
    id: "howitworks/dots",
    wrapper: {"tag":"div","attrs":{"data-step-indicators":true}},
    kind: 'repeat',
    min: 1,
    zero: "invalid-input",
    shapes: [
      { name: 'S01', skeleton: "<span class=\"bg-grape rounded-full size-1.5 transition-colors\" data-step-indicator>" },
      { name: 'S02', skeleton: "<span class=\"bg-grape/25 rounded-full size-1.5 transition-colors\" data-step-indicator>" },
    ],
  },
  {
    id: "ugc/track",
    wrapper: {"tag":"div","classes":["gap-3","pr-3"]},
    kind: 'repeat',
    min: 1,
    zero: "optional-capability",
    shapes: [
      { name: 'S01', skeleton: "<div class=\"lg:max-w-[14rem] max-w-[11rem] shrink-0 w-[42vw]\">\n  <img alt class=\"aspect-[9/16] object-cover rounded-tile w-full\" decoding=\"async\" height=\"<media/intrinsic-height>\" loading=\"eager\" sizes=\"(min-width: 1024px) 14rem, 42vw\" src srcset width=\"<media/intrinsic-width>\">" },
      { name: 'S02', skeleton: "<div class=\"lg:max-w-[14rem] max-w-[11rem] shrink-0 w-[42vw]\">\n  <img alt class=\"aspect-[9/16] object-cover rounded-tile w-full\" decoding=\"async\" height=\"<media/intrinsic-height>\" loading=\"lazy\" sizes=\"(min-width: 1024px) 14rem, 42vw\" src srcset width=\"<media/intrinsic-width>\">" },
      { name: 'S03', skeleton: "<div class=\"lg:max-w-[14rem] max-w-[11rem] shrink-0 w-[42vw]\">\n  <video aria-label autoplay class=\"aspect-[9/16] object-cover rounded-tile w-full\" loop muted playsinline poster preload=\"none\" src>" },
      { name: 'S04', skeleton: "<div class=\"lg:max-w-[14rem] max-w-[11rem] shrink-0 w-[42vw]\">\n  <video autoplay class=\"aspect-[9/16] object-cover rounded-tile w-full\" loop muted playsinline poster preload=\"none\" src tabindex=\"-1\">" },
    ],
  },
  {
    id: "reviews/cards",
    wrapper: {"tag":"div","classes":["snap-mandatory","gap-4"]},
    kind: 'repeat',
    min: 1,
    zero: "optional-capability",
    shapes: [
      { name: 'S01', skeleton: "<article aria-label class=\"bg-white flex flex-col p-5 rounded-card shadow-lift shrink-0 sm:w-[48%] snap-start text-left w-[86%] xl:w-[31%]\">\n  <div aria-label class=\"gap-0.5 inline-flex items-center mb-3\" role=\"img\">\n    <svg aria-hidden=\"true\" class=\"shrink-0 size-4\" viewbox=\"0 0 20 20\">\n      <path class=\"text-gold\" d=\"M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z\" fill=\"currentColor\" opacity=\"<stars/fill>\">\n    <svg aria-hidden=\"true\" class=\"shrink-0 size-4\" viewbox=\"0 0 20 20\">\n      <path class=\"text-gold\" d=\"M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z\" fill=\"currentColor\" opacity=\"<stars/fill>\">\n    <svg aria-hidden=\"true\" class=\"shrink-0 size-4\" viewbox=\"0 0 20 20\">\n      <path class=\"text-gold\" d=\"M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z\" fill=\"currentColor\" opacity=\"<stars/fill>\">\n    <svg aria-hidden=\"true\" class=\"shrink-0 size-4\" viewbox=\"0 0 20 20\">\n      <path class=\"text-gold\" d=\"M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z\" fill=\"currentColor\" opacity=\"<stars/fill>\">\n    <svg aria-hidden=\"true\" class=\"shrink-0 size-4\" viewbox=\"0 0 20 20\">\n      <path class=\"text-gold\" d=\"M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z\" fill=\"currentColor\" opacity=\"<stars/fill>\">\n  <p class=\"flex-1 leading-relaxed text-graphite text-sm\">\n  <div class=\"mt-4\">\n    <p class=\"font-bold text-graphite text-xs\">" },
    ],
  },
  {
    id: "reviews/dots",
    wrapper: {"tag":"div","attrs":{"role":"tablist"},"classes":["mt-3"]},
    kind: 'repeat',
    min: 1,
    zero: "optional-capability",
    shapes: [
      { name: 'S01', skeleton: "<button aria-label aria-selected=\"false\" class=\"bg-grape/25 rounded-full size-1.5 transition-colors\" role=\"tab\" type=\"button\">" },
      { name: 'S02', skeleton: "<button aria-label aria-selected=\"true\" class=\"bg-grape rounded-full size-1.5 transition-colors\" role=\"tab\" type=\"button\">" },
    ],
  },
  {
    id: "faq/items",
    wrapper: {"tag":"div","classes":["divide-y","rounded-tile"]},
    kind: 'repeat',
    relationalIds: true,
    min: 1,
    zero: "invalid-input",
    shapes: [
      { name: 'S01', skeleton: "<div class=\"bg-surface transition-colors\">\n  <h3>\n    <button aria-controls=\"<item-ref-2>\" aria-expanded=\"false\" class=\"flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grape/40 focus-visible:ring-inset font-bold gap-4 items-start justify-between leading-snug md:px-5 md:py-4 md:text-base min-h-12 px-4 py-3.5 text-graphite text-left text-sm w-full\" id=\"<item-ref-1>\" type=\"button\">\n      <span>\n      <svg aria-hidden=\"true\" class=\"motion-reduce:transition-none mt-0.5 shrink-0 size-5 text-steel transition-transform\" viewbox=\"0 0 20 20\">\n        <path d=\"M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z\" fill=\"currentColor\">\n  <div aria-labelledby=\"<item-ref-1>\" class=\"duration-300 grid grid-rows-[0fr] motion-reduce:transition-none overflow-hidden transition-[grid-template-rows]\" id=\"<item-ref-2>\" role=\"region\">\n    <div class=\"duration-200 min-h-0 motion-reduce:transition-none opacity-0 overflow-hidden transition-opacity\">\n      <p class=\"leading-relaxed md:pb-5 md:pr-14 md:px-5 pb-4 pr-12 px-4 text-graphite text-sm\">" },
    ],
  },
  {
    id: "guarantee/cells",
    wrapper: {"tag":"div","classes":["max-w-lg","grid"]},
    kind: 'repeat',
    min: 2,
    zero: "optional-capability",
    shapes: [
      { name: 'S01', skeleton: "<div class=\"flex flex-col gap-2 items-center text-graphite text-xs\">\n  <svg aria-hidden=\"true\" class=\"size-6 text-gold\" viewbox=\"0 0 24 24\">\n    <path d=\"M12 2l8 3.5v5.25c0 5.06-3.4 9.62-8 11.25-4.6-1.63-8-6.19-8-11.25V5.5L12 2zm0 2.22L6 6.7v4.05c0 4 2.6 7.68 6 9.1 3.4-1.42 6-5.1 6-9.1V6.7l-6-2.48z\" fill=\"currentColor\">\n  <span>" },
    ],
  },
];
