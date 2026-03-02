/** @typedef {import('$lib/api/archive').ArchiveConfig} ArchiveConfig */

/**
 * @typedef ServiceHostMatcher
 * @property {string} service
 * @property {(host: string) => boolean} test
 */

/** @type {ServiceHostMatcher[]} */
const serviceHostMatchers = [
    { service: 'youtube', test: (host) => host === 'youtu.be' || host.endsWith('youtube.com') },
    { service: 'twitter', test: (host) => host === 'x.com' || host.endsWith('twitter.com') },
    { service: 'instagram', test: (host) => host.endsWith('instagram.com') },
    { service: 'tiktok', test: (host) => host.endsWith('tiktok.com') },
    { service: 'soundcloud', test: (host) => host.endsWith('soundcloud.com') },
    { service: 'vimeo', test: (host) => host.endsWith('vimeo.com') },
    { service: 'reddit', test: (host) => host === 'redd.it' || host.endsWith('reddit.com') },
    { service: 'twitch', test: (host) => host.endsWith('twitch.tv') },
    { service: 'bilibili', test: (host) => host === 'b23.tv' || host.endsWith('bilibili.com') },
];

/** @param {string | undefined} archiveRoot */
const normalizeRoot = (archiveRoot) => {
    const root = (archiveRoot || '/archive').trim();
    return root.endsWith('/') ? root.slice(0, -1) : root;
};

/** @param {string} rawURL */
export const detectServiceFromURL = (rawURL) => {
    if (!rawURL) return null;

    let parsed;
    try {
        parsed = new URL(rawURL);
    } catch {
        return null;
    }

    const host = parsed.hostname.toLowerCase();
    const match = serviceHostMatchers.find((candidate) => candidate.test(host));
    return match ? match.service : null;
};

/**
 * @param {ArchiveConfig | null} config
 * @param {string | null} service
 */
export const resolveArchivePath = (config, service) => {
    if (!service) return null;

    const root = normalizeRoot(config?.archiveRoot);
    const directory = config?.serviceDirs?.[service] || service;

    return {
        root,
        directory,
        fullPath: `${root}/${directory}`,
    };
};

export default {
    detectServiceFromURL,
    resolveArchivePath,
};
