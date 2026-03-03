import { writable, derived, get } from "svelte/store";
import { browser } from "$app/environment";
import {
    listBackgroundJobs,
    subscribeToJobEvents,
    type ArchiveJob,
} from "$lib/api/archive";

const STORAGE_KEY = "cobalt-tracked-job-ids";
const POLL_INTERVAL_MS = 3000;

interface JobsState {
    jobs: ArchiveJob[];
    loading: boolean;
    error: string | null;
    total: number;
    hasMore: boolean;
    cursor: number;
    activeCount: number;
}

const createJobsStore = () => {
    const { subscribe, set, update } = writable<JobsState>({
        jobs: [],
        loading: false,
        error: null,
        total: 0,
        hasMore: false,
        cursor: 0,
        activeCount: 0,
    });

    let unsubscribeSSE: (() => void) | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let trackedJobIds: Set<string> = new Set();

    const loadTrackedIds = () => {
        if (!browser) return;
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                trackedJobIds = new Set(JSON.parse(stored));
            }
        } catch {
            trackedJobIds = new Set();
        }
    };

    const saveTrackedIds = () => {
        if (!browser) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(trackedJobIds)));
        } catch {
            // Ignore storage errors
        }
    };

    const trackJobId = (id: string) => {
        trackedJobIds.add(id);
        saveTrackedIds();
    };

    const addJob = (job: ArchiveJob) => {
        update((state) => {
            // Check if job already exists
            if (state.jobs.find((j) => j.id === job.id)) {
                return state;
            }
            trackJobId(job.id);
            return {
                ...state,
                jobs: [job, ...state.jobs],
                total: state.total + 1,
            };
        });
    };

    const untrackJobId = (id: string) => {
        trackedJobIds.delete(id);
        saveTrackedIds();
    };

    const updateJobInState = (updatedJob: ArchiveJob) => {
        update((state) => {
            const index = state.jobs.findIndex((j) => j.id === updatedJob.id);
            if (index >= 0) {
                const jobs = [...state.jobs];
                jobs[index] = updatedJob;
                return { ...state, jobs };
            }
            // If job not in current list, add it if it's a tracked job
            if (trackedJobIds.has(updatedJob.id)) {
                return { ...state, jobs: [updatedJob, ...state.jobs] };
            }
            return state;
        });
    };

    const fetchJobs = async (reset = false) => {
        if (!browser) return;

        update((s) => ({ ...s, loading: true, error: null }));

        try {
            const result = await listBackgroundJobs({
                limit: 50,
                cursor: reset ? 0 : get({ subscribe }).cursor,
            });

            if (result) {
                update((state) => {
                    const newJobs = reset ? result.jobs : [...state.jobs, ...result.jobs];
                    // Deduplicate by id
                    const uniqueJobs = newJobs.filter((job, index, self) =>
                        index === self.findIndex((j) => j.id === job.id)
                    );
                    return {
                        ...state,
                        jobs: uniqueJobs,
                        total: result.total,
                        hasMore: result.hasMore,
                        cursor: result.cursor + result.jobs.length,
                        activeCount: result.activeCount,
                        loading: false,
                    };
                });

                // Track all loaded job IDs
                result.jobs.forEach((job) => trackJobId(job.id));
            }
        } catch (e) {
            update((s) => ({ ...s, loading: false, error: "Failed to load jobs" }));
        }
    };

    const startPolling = () => {
        if (pollInterval) return;
        pollInterval = setInterval(() => fetchJobs(true), POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    };

    const connectSSE = () => {
        if (!browser || unsubscribeSSE) return;

        try {
            unsubscribeSSE = subscribeToJobEvents((job) => {
                updateJobInState(job);
                trackJobId(job.id);
            });
        } catch {
            // Fallback to polling if SSE fails
            startPolling();
        }
    };

    const disconnect = () => {
        if (unsubscribeSSE) {
            unsubscribeSSE();
            unsubscribeSSE = null;
        }
        stopPolling();
    };

    const hasActiveJobs = derived({ subscribe }, ($state) => {
        return $state.jobs.some((j) => j.state === "queued" || j.state === "running");
    });

    // Initialize
    if (browser) {
        loadTrackedIds();
    }

    return {
        subscribe,
        fetchJobs,
        updateJobInState,
        trackJobId,
        untrackJobId,
        addJob,
        connectSSE,
        disconnect,
        startPolling,
        stopPolling,
        hasActiveJobs,
    };
};

export const backgroundJobs = createJobsStore();
