// Fetches/refreshes the job list (design §1's client/api/useJobs.ts; task
// F3/F4). No SSE here — GET /api/jobs is a plain snapshot; App.tsx calls
// `refresh()` after creating a job or on an interval, and useJobStream
// (per-job SSE) is what keeps an individual job's detail panel live.
import { useCallback, useEffect, useState } from 'react';
import { listJobs } from './client';
import type { JobRecord } from '../../shared/jobs';

export type UseJobsResult = {
  jobs: JobRecord[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useJobs(): UseJobsResult {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listJobs();
      setJobs(res.jobs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { jobs, loading, error, refresh };
}
