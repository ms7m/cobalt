import { currentApiURL } from "$lib/api/api-url";

export interface ArchiveConfig {
    archiveRoot: string;
    serviceDirs: Record<string, string>;
}

export interface ArchiveEntry {
    id: string;
    service: string;
    filename: string;
    relativePath: string;
    size: number;
    mime: string;
    kind: 'video' | 'audio' | 'image' | 'other';
    thumbnailPath?: string | null;
    fileUrl?: string;
    streamUrl?: string | null;
    thumbnailUrl?: string | null;
    createdAt: string;
}

export interface ArchiveListResponse {
    success: boolean;
    entries: ArchiveEntry[];
    total: number;
    cursor: number;
    hasMore: boolean;
}

export interface ArchiveBrowseEntry {
    name: string;
    path: string;
    type: 'directory' | 'file';
    size: number | null;
    modifiedAt: string;
}

export interface ArchiveBrowseResponse {
    success: boolean;
    root: string;
    currentPath: string;
    parentPath: string | null;
    entries: ArchiveBrowseEntry[];
}

export interface ArchiveMutationResult {
    success: boolean;
    config?: ArchiveConfig;
    error?: string;
}

export const getArchiveConfig = async (): Promise<ArchiveConfig | null> => {
    try {
        const response = await fetch(`${currentApiURL()}/archive/config`);
        const data = await response.json();
        if (data.success) {
            return data.config;
        }
        return null;
    } catch {
        return null;
    }
};

export const setArchiveConfig = async (config: Partial<ArchiveConfig>): Promise<ArchiveConfig | null> => {
    try {
        const response = await fetch(`${currentApiURL()}/archive/config`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });
        const data = await response.json();
        if (data.success) {
            return data.config;
        }
        return null;
    } catch {
        return null;
    }
};

export const setServiceDirectory = async (
    service: string,
    directory: string | null
): Promise<ArchiveMutationResult> => {
    try {
        const response = await fetch(`${currentApiURL()}/archive/config/services/${service}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ directory })
        });
        const data = await response.json();
        if (data.success) {
            return {
                success: true,
                config: data.config,
            };
        }

        return {
            success: false,
            error: data?.error || 'Failed to save service mapping',
        };
    } catch {
        return {
            success: false,
            error: 'Request failed while saving service mapping',
        };
    }
};

export const listArchiveDownloads = async (options: {
    limit?: number;
    cursor?: number;
    service?: string;
} = {}): Promise<ArchiveListResponse | null> => {
    try {
        const params = new URLSearchParams();
        if (options.limit) params.set('limit', options.limit.toString());
        if (options.cursor) params.set('cursor', options.cursor.toString());
        if (options.service) params.set('service', options.service);
        
        const response = await fetch(`${currentApiURL()}/archive/downloads?${params}`);
        const data = await response.json();
        if (data.success) {
            return data;
        }
        return null;
    } catch {
        return null;
    }
};

export const downloadArchiveFile = (id: string): string => {
    return `${currentApiURL()}/archive/file/${id}`;
};

export const streamArchiveFile = (id: string): string => {
    return `${currentApiURL()}/archive/file/${id}/stream`;
};

export const archiveThumbnail = (id: string): string => {
    return `${currentApiURL()}/archive/file/${id}/thumbnail`;
};

export const browseArchiveDirectory = async (
    path = "",
    includeFiles = true
): Promise<ArchiveBrowseResponse | null> => {
    try {
        const params = new URLSearchParams();
        if (path) params.set('path', path);
        params.set('includeFiles', includeFiles ? '1' : '0');

        const response = await fetch(`${currentApiURL()}/archive/browse?${params}`);
        const data = await response.json();
        if (data.success) {
            return data;
        }
        return null;
    } catch {
        return null;
    }
};

export interface ArchiveJob {
    id: string;
    parentId: string | null;
    type: 'single' | 'parent' | 'child';
    state: 'queued' | 'running' | 'done' | 'error' | 'canceled';
    service: string | null;
    filename: string | null;
    progress: {
        bytesDownloaded: number;
        bytesTotal: number | null;
        percent: number;
    };
    archiveEntryId: string | null;
    error: string | null;
    createdAt: string;
    updatedAt: string;
    children?: ArchiveJob[];
}

export interface ArchiveJobListResponse {
    success: boolean;
    jobs: ArchiveJob[];
    total: number;
    cursor: number;
    hasMore: boolean;
    activeCount: number;
}

export const createBackgroundJob = async (request: {
    url: string;
    service?: string;
    filename?: string;
    [key: string]: unknown;
}): Promise<{ success: boolean; job?: ArchiveJob; error?: string }> => {
    try {
        const response = await fetch(`${currentApiURL()}/archive/jobs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(request)
        });
        const data = await response.json();
        if (data.success) {
            return { success: true, job: data.job };
        }
        return { success: false, error: data.error };
    } catch {
        return { success: false, error: 'Failed to create job' };
    }
};

export const listBackgroundJobs = async (options: {
    limit?: number;
    cursor?: number;
    state?: string;
    service?: string;
    parentId?: string | null;
} = {}): Promise<ArchiveJobListResponse | null> => {
    try {
        const params = new URLSearchParams();
        if (options.limit) params.set('limit', options.limit.toString());
        if (options.cursor) params.set('cursor', options.cursor.toString());
        if (options.state) params.set('state', options.state);
        if (options.service) params.set('service', options.service);
        if (options.parentId !== undefined) params.set('parentId', options.parentId === null ? 'null' : options.parentId);
        
        const response = await fetch(`${currentApiURL()}/archive/jobs?${params}`);
        const data = await response.json();
        if (data.success) {
            return data;
        }
        return null;
    } catch {
        return null;
    }
};

export const getBackgroundJob = async (id: string): Promise<{ success: boolean; job?: ArchiveJob; error?: string } | null> => {
    try {
        const response = await fetch(`${currentApiURL()}/archive/jobs/${id}`);
        const data = await response.json();
        if (data.success) {
            return { success: true, job: data.job };
        }
        return { success: false, error: data.error };
    } catch {
        return null;
    }
};

export const cancelBackgroundJob = async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
        const response = await fetch(`${currentApiURL()}/archive/jobs/${id}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (data.success) {
            return { success: true };
        }
        return { success: false, error: data.error };
    } catch {
        return { success: false, error: 'Failed to cancel job' };
    }
};

export const retryBackgroundJob = async (id: string): Promise<{ success: boolean; job?: ArchiveJob; error?: string }> => {
    try {
        const response = await fetch(`${currentApiURL()}/archive/jobs/${id}/retry`, {
            method: 'POST'
        });
        const data = await response.json();
        if (data.success) {
            return { success: true, job: data.job };
        }
        return { success: false, error: data.error };
    } catch {
        return { success: false, error: 'Failed to retry job' };
    }
};

export type JobUpdateCallback = (job: ArchiveJob) => void;

export const subscribeToJobEvents = (onUpdate: JobUpdateCallback): (() => void) => {
    const eventSource = new EventSource(`${currentApiURL()}/archive/jobs/events`);
    
    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'jobUpdate' && data.job) {
                onUpdate(data.job);
            }
        } catch {
            // Ignore parse errors
        }
    };
    
    return () => {
        eventSource.close();
    };
};

export default {
    getArchiveConfig,
    setArchiveConfig,
    setServiceDirectory,
    browseArchiveDirectory,
    listArchiveDownloads,
    downloadArchiveFile,
    streamArchiveFile,
    archiveThumbnail,
    createBackgroundJob,
    listBackgroundJobs,
    getBackgroundJob,
    cancelBackgroundJob,
    retryBackgroundJob,
    subscribeToJobEvents,
};
