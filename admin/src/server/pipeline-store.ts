// In-memory store for pipeline runs plus its subscriber fan-out.
//
// Deliberately NOT a second JobRegistry. Each STAGE already becomes a real
// JobRecord with its own log, events and disk mirror; what is missing is a
// handle on the run that ties those jobs together. This holds exactly that —
// the PipelineRecord — and nothing else. No spawning, no locking, no
// persistence: a pipeline is a view over jobs that are themselves durable.
//
// One run at a time, on purpose. The stages share the scrape and Gemini locks
// anyway, so a second concurrent pipeline would immediately queue behind the
// first while making the UI's "what is happening right now" ambiguous.
import type { PipelineRecord } from './pipeline';

type Subscriber = (record: PipelineRecord) => void;

const records = new Map<string, PipelineRecord>();
const subscribers = new Map<string, Set<Subscriber>>();
let activeId: string | null = null;

export function put(record: PipelineRecord): void {
  records.set(record.pipelineId, record);
  if (record.status === 'running') activeId = record.pipelineId;
  else if (activeId === record.pipelineId) activeId = null;

  for (const cb of subscribers.get(record.pipelineId) ?? []) {
    try {
      cb(record);
    } catch {
      // A broken subscriber must never take the pipeline down with it.
    }
  }
}

export function get(pipelineId: string): PipelineRecord | null {
  return records.get(pipelineId) ?? null;
}

export function list(): PipelineRecord[] {
  return [...records.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** The run currently in flight, or null. Used to refuse a concurrent start. */
export function active(): PipelineRecord | null {
  return activeId ? (records.get(activeId) ?? null) : null;
}

export function subscribe(pipelineId: string, cb: Subscriber): () => void {
  const set = subscribers.get(pipelineId) ?? new Set<Subscriber>();
  set.add(cb);
  subscribers.set(pipelineId, set);
  return () => {
    set.delete(cb);
    if (set.size === 0) subscribers.delete(pipelineId);
  };
}

/** Test seam only — production never resets a live store. */
export function __reset(): void {
  records.clear();
  subscribers.clear();
  activeId = null;
}
