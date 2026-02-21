<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/i18n/translations";
    import {
        getArchiveConfig,
        setArchiveConfig,
        setServiceDirectory,
        type ArchiveConfig
    } from "$lib/api/archive";

    import SettingsCategory from "$components/settings/SettingsCategory.svelte";
    import SettingsInput from "$components/settings/SettingsInput.svelte";
    import SettingsToggle from "$components/buttons/SettingsToggle.svelte";
    import IconFolder from "@tabler/icons-svelte/IconFolder.svelte";
    import IconTrash from "@tabler/icons-svelte/IconTrash.svelte";

    let config: ArchiveConfig | null = null;
    let loading = true;
    let saving = false;
    let newServiceName = "";
    let newServiceDir = "";

    const services = ["youtube", "twitter", "instagram", "tiktok", "soundcloud", "vimeo", "reddit", "twitch", "bilibili"];

    onMount(async () => {
        await loadConfig();
    });

    const loadConfig = async () => {
        loading = true;
        config = await getArchiveConfig();
        loading = false;
    };

    const updateRootDir = async (value: string) => {
        if (!config) return;
        saving = true;
        await setArchiveConfig({ archiveRoot: value });
        await loadConfig();
        saving = false;
    };

    const addServiceMapping = async () => {
        if (!newServiceName || !newServiceDir) return;
        saving = true;
        await setServiceDirectory(newServiceName, newServiceDir);
        newServiceName = "";
        newServiceDir = "";
        await loadConfig();
        saving = false;
    };

    const removeServiceMapping = async (service: string) => {
        saving = true;
        await setServiceDirectory(service, null);
        await loadConfig();
        saving = false;
    };

    const setQuickMapping = async (service: string, directory: string) => {
        saving = true;
        await setServiceDirectory(service, directory);
        await loadConfig();
        saving = false;
    };
</script>

{#if loading}
    <div class="loading">{$t("settings.storage.loading")}</div>
{:else}
    <SettingsCategory
        sectionId="storage-root"
        title={$t("settings.storage.root_directory")}
    >
        <div class="setting-description">
            {$t("settings.storage.root_description")}
        </div>
        <div class="root-input">
            <input
                type="text"
                value={config?.archiveRoot || ""}
                placeholder="/path/to/archive"
                on:change={(e) => updateRootDir(e.currentTarget.value)}
                disabled={saving}
            />
        </div>
    </SettingsCategory>

    <SettingsCategory
        sectionId="storage-mappings"
        title={$t("settings.storage.service_mappings")}
    >
        <div class="setting-description">
            {$t("settings.storage.mappings_description")}
        </div>

        <div class="quick-mappings">
            <h4>{$t("settings.storage.quick_setup")}</h4>
            <div class="quick-buttons">
                <button
                    class="button"
                    on:click={() => setQuickMapping("soundcloud", "music")}
                    disabled={saving}
                >
                    <IconFolder />
                    {$t("settings.storage.music_services")}
                </button>
            </div>
        </div>

        <div class="mappings-list">
            {#each Object.entries(config?.serviceDirs || {}) as [service, directory]}
                <div class="mapping-item">
                    <div class="mapping-info">
                        <span class="service-name">{service}</span>
                        <span class="arrow">→</span>
                        <span class="directory">{directory}</span>
                    </div>
                    <button
                        class="button icon-button"
                        on:click={() => removeServiceMapping(service)}
                        disabled={saving}
                    >
                        <IconTrash />
                    </button>
                </div>
            {/each}
        </div>

        <div class="add-mapping">
            <select bind:value={newServiceName} disabled={saving}>
                <option value="">{$t("settings.storage.select_service")}</option>
                {#each services as service}
                    {#if !config?.serviceDirs?.[service]}
                        <option value={service}>{service}</option>
                    {/if}
                {/each}
            </select>
            <input
                type="text"
                bind:value={newServiceDir}
                placeholder={$t("settings.storage.directory_placeholder")}
                disabled={saving}
            />
            <button
                class="button"
                on:click={addServiceMapping}
                disabled={!newServiceName || !newServiceDir || saving}
            >
                {$t("button.add")}
            </button>
        </div>
    </SettingsCategory>

    <SettingsCategory
        sectionId="storage-preview"
        title={$t("settings.storage.path_preview")}
    >
        <div class="path-preview">
            <code>{config?.archiveRoot || "/archive"}/<span class="highlight">{config?.serviceDirs?.youtube || "youtube"}</span>/filename.mp4</code>
        </div>
    </SettingsCategory>
{/if}

<style>
    .loading {
        padding: 40px;
        text-align: center;
        color: var(--gray);
    }

    .setting-description {
        margin-bottom: 16px;
        color: var(--gray);
        font-size: 14px;
    }

    .root-input input {
        width: 100%;
        padding: 12px 16px;
        border-radius: var(--border-radius);
        border: none;
        background: var(--button);
        color: var(--secondary);
        font-size: 14px;
    }

    .quick-mappings {
        margin-bottom: 20px;
        padding: 16px;
        background: var(--button);
        border-radius: var(--border-radius);
    }

    .quick-mappings h4 {
        margin: 0 0 12px 0;
        font-size: 14px;
        font-weight: 500;
    }

    .quick-buttons {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }

    .quick-buttons button {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .quick-buttons :global(svg) {
        width: 18px;
        height: 18px;
    }

    .mappings-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 16px;
    }

    .mapping-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: var(--button);
        border-radius: var(--border-radius);
    }

    .mapping-info {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .service-name {
        font-weight: 500;
        text-transform: uppercase;
        font-size: 12px;
    }

    .arrow {
        color: var(--gray);
    }

    .directory {
        font-family: monospace;
        font-size: 13px;
    }

    .add-mapping {
        display: flex;
        gap: 8px;
    }

    .add-mapping select,
    .add-mapping input {
        padding: 10px 12px;
        border-radius: var(--border-radius);
        border: none;
        background: var(--button);
        color: var(--secondary);
        font-size: 14px;
    }

    .add-mapping select {
        min-width: 150px;
    }

    .add-mapping input {
        flex: 1;
    }

    .path-preview {
        padding: 16px;
        background: var(--button);
        border-radius: var(--border-radius);
        overflow-x: auto;
    }

    .path-preview code {
        font-family: monospace;
        font-size: 13px;
        color: var(--secondary);
    }

    .path-preview .highlight {
        color: var(--accent);
        font-weight: 500;
    }

    @media screen and (max-width: 760px) {
        .add-mapping {
            flex-direction: column;
        }

        .mapping-info {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
        }
    }
</style>
