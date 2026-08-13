// React hook consuming GET /api/jobs/:id/events (design §3; task F3/F4).
// Thin imperative wrapper around a native `EventSource` — all frame-parsing
// and merge logic lives in job-stream-state.ts (pure, independently tested).
import { useEffect, useReducer } from 'react';
import type { SseFrame } from '../../shared/api';
import { initialJobStreamState, jobStreamReducer, type JobStreamState } from './job-stream-state';

/**
 * Frame kinds the SERVER names as SSE `event:` lines and that carry a JSON
 * `data:` payload we care about (design §3's wire format). `ping` is
 * deliberately excluded: it carries no `id:` (never advances Last-Event-ID)
 * and no payload worth parsing — per the SSE spec, a named event with no
 * registered listener is simply dropped by EventSource, so omitting it here
 * IS the correct handling, not an oversight.
 */
const FRAME_EVENTS: readonly SseFrame['type'][] = ['job', 'log', 'stage', 'end', 'overflow'];

export function useJobStream(jobId: string | null): JobStreamState {
  const [state, dispatch] = useReducer(jobStreamReducer, initialJobStreamState);

  useEffect(() => {
    if (!jobId) return;

    dispatch({ kind: 'connecting' });
    const source = new EventSource(`/api/jobs/${jobId}/events`);

    source.addEventListener('open', () => dispatch({ kind: 'open' }));

    for (const name of FRAME_EVENTS) {
      source.addEventListener(name, (evt) => {
        const raw = (evt as MessageEvent<string>).data;
        let frame: SseFrame;
        try {
          frame = JSON.parse(raw) as SseFrame;
        } catch {
          return; // a malformed payload must never crash the whole stream
        }
        dispatch({ kind: 'frame', frame });

        // The server closes its side after `end`/`overflow` (design §3 —
        // terminal jobs get replay + end + close, never a hanging
        // keepalive; overflow force-closes the client past the drop
        // threshold). Mirror that on our side so a finished/overflowed job
        // never lingers as an open connection or triggers a pointless
        // native reconnect against a stream the server has already ended.
        if (frame.type === 'end' || frame.type === 'overflow') {
          source.close();
        }
      });
    }

    // A bare 'error' means the underlying connection dropped and the
    // BROWSER itself is retrying — this is native EventSource's own
    // reconnect path, and it is the one that legitimately carries
    // `Last-Event-ID` forward (the browser tracks it internally from `id:`
    // lines already seen on THIS SAME connection; JS has no header-setting
    // API on EventSource to reconstruct that manually). We deliberately do
    // NOT construct a new EventSource here — doing so would start a fresh
    // connection with no Last-Event-ID and defeat the server's
    // replay-on-reconnect design (design §3, judgment call #3). We only
    // reflect the "reconnecting" state for the UI.
    source.addEventListener('error', () => {
      if (source.readyState === EventSource.CONNECTING) {
        dispatch({ kind: 'connecting' });
      }
    });

    return () => {
      source.close();
      dispatch({ kind: 'closed' });
    };
  }, [jobId]);

  return state;
}
