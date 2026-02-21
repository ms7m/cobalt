import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname, normalize } from "path";
import { env } from "../config.js";

const CONFIG_PATH = process.env.ARCHIVE_CONFIG_PATH || "./archive-config.json";

let config = {
    archiveRoot: env.mediaArchiveRoot || "",
    serviceDirs: {}
};

let configLoaded = false;

const loadConfig = async () => {
    if (configLoaded) return config;
    
    try {
        const data = await readFile(CONFIG_PATH, 'utf8');
        const parsed = JSON.parse(data);
        config = {
            archiveRoot: parsed.archiveRoot || env.mediaArchiveRoot || "",
            serviceDirs: parsed.serviceDirs || {}
        };
        configLoaded = true;
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.error('Failed to load archive config:', e);
        }
        configLoaded = true;
    }
    
    return config;
};

const saveConfig = async () => {
    try {
        await mkdir(dirname(CONFIG_PATH), { recursive: true });
        await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (e) {
        console.error('Failed to save archive config:', e);
        throw e;
    }
};

export const getConfig = async () => {
    return await loadConfig();
};

export const setConfig = async (newConfig) => {
    config = {
        ...config,
        ...newConfig
    };
    await saveConfig();
    return config;
};

export const getServiceDir = (service) => {
    return config.serviceDirs[service] || service;
};

export const setServiceDir = async (service, dir) => {
    if (dir === null || dir === undefined || dir === service) {
        delete config.serviceDirs[service];
    } else {
        const sanitized = sanitizeDirName(dir);
        if (!sanitized) {
            throw new Error('Invalid directory name');
        }
        config.serviceDirs[service] = sanitized;
    }
    await saveConfig();
};

const sanitizeDirName = (name) => {
    if (!name || typeof name !== 'string') return null;
    const sanitized = normalize(name)
        .replace(/\\/g, '/')
        .replace(/\.{2,}/g, '.')
        .replace(/^[./\\]+/, '')
        .replace(/[<>:"|?*\x00-\x1f]/g, '_')
        .slice(0, 100);
    
    if (!sanitized || sanitized === '.' || sanitized === '..') return null;
    return sanitized;
};

export default {
    getConfig,
    setConfig,
    getServiceDir,
    setServiceDir
};
