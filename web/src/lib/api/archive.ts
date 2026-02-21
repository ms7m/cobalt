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

export const setServiceDirectory = async (service: string, directory: string | null): Promise<boolean> => {
    try {
        const response = await fetch(`${currentApiURL()}/archive/config/services/${service}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ directory })
        });
        const data = await response.json();
        return data.success;
    } catch {
        return false;
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

export default {
    getArchiveConfig,
    setArchiveConfig,
    setServiceDirectory,
    listArchiveDownloads,
    downloadArchiveFile
};
