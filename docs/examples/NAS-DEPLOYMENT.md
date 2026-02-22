# Cobalt NAS Deployment Guide

This docker-compose configuration is optimized for self-hosted NAS deployments with local archiving and management features.

## Features

- **Automatic Archiving**: All downloads are saved to your NAS organized by service
- **Custom Folder Organization**: Configure per-service folders (e.g., SoundCloud → music)
- **Download History**: Browse and re-download previously saved files
- **LAN-Optimized**: No HTTPS/SSL requirements - works perfectly on local network
- **YouTube Support**: Uses yt-dlp with Deno runtime for reliable extraction

## Quick Start

1. **Clone the repository** to your NAS:
   ```bash
   git clone https://github.com/YOUR_USERNAME/cobalt.git
   cd cobalt
   ```

2. **Create a GitHub token for private GHCR pulls**:
   - Go to GitHub -> Settings -> Developer settings -> Personal access tokens
   - Create a token with at least `read:packages`

3. **Log in to GHCR from your NAS**:
   ```bash
   docker login ghcr.io -u YOUR_GITHUB_USERNAME
   ```
   Use the token from step 2 as the password.

4. **Edit the docker-compose file**:
   ```bash
   nano docs/examples/docker-compose.nas.yml
   ```

   Replace the image with your private package path:
   - `image: ghcr.io/YOUR_GITHUB_USERNAME/cobalt-api:nas-latest`
    
   Replace `YOUR_NAS_IP` with your actual NAS IP address:
   - `API_URL: "http://192.168.1.100:9000/"`
   - `WEB_DEFAULT_API: "http://192.168.1.100:9000"`

5. **Set your archive path** (line 58):
   ```yaml
   volumes:
     - /volume1/media/downloads:/archive  # Synology example
     # or
     - /mnt/user/media:/archive           # Unraid example
     # or
     - /srv/dev-disk-by-uuid-xxx/media:/archive  # OpenMediaVault example
   ```

6. **Create config directory**:
   ```bash
   mkdir -p config
   ```

7. **Deploy**:
   ```bash
   docker-compose -f docs/examples/docker-compose.nas.yml up -d
   ```

8. **Access**:
   - Web UI: http://YOUR_NAS_IP:5173
   - API: http://YOUR_NAS_IP:9000

## Directory Structure

After downloading, your archive will be organized as:

```
/archive/
├── youtube/
│   ├── Video Title_1234567890_abc123.mp4
│   └── Another Video_1234567891_def456.mp4
├── soundcloud/
│   └── Artist - Song_1234567892_ghi789.mp3
└── music/                    # if you configure soundcloud → music
    └── Artist - Song_1234567893_jkl012.mp3
```

## Configuration

### Archive Settings

1. Open the web UI at http://YOUR_NAS_IP:5173
2. Go to **Settings → Storage**
3. Configure:
   - **Root Directory**: Already set via `MEDIA_ARCHIVE_ROOT` env var
   - **Service Folders**: Customize which folder each service uses

### Example: Route Music to "music" Folder

In Settings → Storage:
1. Click "Music Services" quick setup button, OR
2. Manually add:
   - Service: `soundcloud`
   - Folder: `music`

Now all SoundCloud downloads go to `/archive/music/` instead of `/archive/soundcloud/`.

### Download History

- Click the **Downloads** tab in the sidebar
- Browse all archived downloads
- Filter by service
- Click download icon to re-download any file

## Environment Variables

### API Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_URL` | Required | Your NAS URL with port |
| `MEDIA_ARCHIVE_ROOT` | `/archive` | Where downloads are saved |
| `ARCHIVE_CONFIG_PATH` | `/config/archive-config.json` | Archive settings file |
| `ARCHIVE_INDEX_PATH` | `/config/archive-index.jsonl` | Download history index |
| `DURATION_LIMIT` | `10800` | Max video duration (seconds) |
| `API_INSTANCE_COUNT` | `1` | Number of worker processes |

### Web Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WEB_DEFAULT_API` | Required | URL to API backend |

## Persistent Data

The following data persists across container restarts:

- **Archive Config**: `/config/archive-config.json`
- **Download History**: `/config/archive-index.jsonl`
- **Actual Downloads**: Your configured archive directory
- **Cookies** (if enabled): `/config/cookies.json`

## Updating

To update to the latest code:

```bash
cd cobalt
git pull
docker-compose -f docs/examples/docker-compose.nas.yml pull
docker-compose -f docs/examples/docker-compose.nas.yml up -d
```

## Troubleshooting

### Downloads not saving
- Check that `MEDIA_ARCHIVE_ROOT` volume mount is correct
- Ensure the NAS path has write permissions for the container user (UID 1000)

### Web UI can't connect to API
- Verify `WEB_DEFAULT_API` matches your NAS IP
- Check that port 9000 is not blocked by firewall

### YouTube downloads failing
- Check container logs: `docker logs cobalt-api`
- Ensure yt-dlp and deno are working: `docker exec cobalt-api yt-dlp --version`

### File permissions issues
Add to docker-compose for proper user mapping:
```yaml
services:
  cobalt-api:
    user: "${UID}:${GID}"  # Your NAS user/group IDs
```

## Advanced: Cookies

For downloading age-restricted or private content:

1. Export cookies from your browser using an extension
2. Save as `cookies.json` in the same directory as docker-compose
3. Uncomment in docker-compose:
   ```yaml
   environment:
     COOKIE_PATH: "/config/cookies.json"
   volumes:
     - ./cookies.json:/config/cookies.json:ro
   ```

## Network

Services communicate over the `cobalt-network` bridge network:
- API: `172.20.0.2` (port 9000)
- Web: `172.20.0.3` (port 5173)

You can modify ports in the compose file if 9000/5173 are already in use.

## Support

- Main repo: https://github.com/imputnet/cobalt
- Documentation: `/docs` folder in this repo
- Issues: Check upstream cobalt issues first
