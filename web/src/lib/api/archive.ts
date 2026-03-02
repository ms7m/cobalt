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

export default {
    getArchiveConfig,
    setArchiveConfig,
    setServiceDirectory,
    browseArchiveDirectory,
    listArchiveDownloads,
    downloadArchiveFile
};
