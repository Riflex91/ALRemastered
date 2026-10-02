# ALRemastered

ALRemastered is a resource-efficient Adventure Land client designed for headless automation with an optional browser experience.

## Choose your operating system

Choose the installer for the operating system you want to run ALRemastered on:

- **Windows (x64)** — assisted installer with a user-selectable installation folder.
- **Linux (x64)** — self-contained installer with a user-selectable installation folder. It uses a graphical path prompt when `zenity` or `kdialog` is available and falls back to a terminal prompt.

The application runtime is bundled with both installers. End users do not need to install Node.js separately.

Windows and Linux installers preserve the chosen installation location during upgrades. User data is stored outside the program directory and is kept during upgrades and normal uninstall operations.

> Release downloads will be attached to GitHub Releases once the first test build is published.

## Development

ALRemastered currently targets Node.js 24 LTS. The foundation keeps third-party runtime dependencies at zero.

```bash
npm run check
```

Run the core health check:

```bash
npm run health
```

## Installer development

Linux:

```bash
npm run build
npm run installer:linux
```

Windows (requires NSIS):

```powershell
npm run build
npm run installer:windows
```

## Local dashboard

Starting ALRemastered normally launches a local dashboard at `http://127.0.0.1:3210` and opens it in the default browser when a graphical desktop is available.

The first dashboard slice includes:

- core status, client version, platform and uptime
- live Debug Console
- level filtering and text search
- pause/resume and auto-scroll
- **Copy full log**
- **Copy filtered log**
- **Download log**
- **Clear log**

The dashboard server listens only on the local loopback interface. Diagnostic log exports are produced from already sanitized records.

## Automatic updates

> Bootstrap note: automatic updates can only be used by a client version that already contains the updater. Therefore the first updater-enabled build (`0.1.0-alpha.5`) must be installed manually once. From that point onward, later releases are discovered and installed through the in-client update flow.


ALRemastered checks the repository's public GitHub Releases at startup and periodically while running. The dashboard also provides **Check for updates**.

When a newer version is available, the dashboard shows:

- **Install update**
- **Skip this version**
- **Remind me tomorrow**
- release notes
- current/new version
- download progress

Updates are never installed without an explicit **Install update** action. The Core selects the installer for the current operating system and architecture, downloads it from the official `Riflex91/ALRemastered` GitHub Release, and verifies its exact file size and SHA-256 digest before scheduling installation. A checksum mismatch blocks installation and is written to the Debug Console.

After **Install update** is confirmed, ALRemastered shuts down the old local process, installs the verified update unattended, closes the installer after success, and starts the newly installed client with browser opening suppressed. The already open dashboard page stays in place, waits for the local backend to return, and reloads itself when the new version is reachable. If installation rolls back, the previous client is restarted so the dashboard can reconnect.

**Skip this version** applies only to that exact version. **Remind me tomorrow** suppresses the same version for 24 hours. A newer version overrides either choice.

Release publication is handled by the `Publish release` GitHub Actions workflow so Windows, Linux and `ALRemastered-update.json` are produced from one commit.

## Adventure Land account connection

Slice 2.1 adds an explicit Adventure Land account connection in the local dashboard. ALRemastered sends the supplied email and password directly to Adventure Land's login API with login-only semantics. The password is never persisted. A successful Adventure Land auth session is kept only in the running ALRemastered process and is cleared by **Disconnect account** or process exit.

The dashboard exposes only connection state, account ID and connection time. The Adventure Land auth value is never returned by dashboard APIs or UI state. Password and auth fields are treated as secrets by the structured logger and diagnostic sanitizer.

## Character list and server selection

Slice 2.2 uses the connected in-memory Adventure Land session to request the official `servers_and_characters` account payload. The dashboard shows each returned character's name, class/type, level and online state, plus the current Adventure Land server list and player counts.

**Use selected server** stores only the selected server key in the running ALRemastered process. This slice does not start a character, open a game socket or begin automation. Disconnecting the account clears the loaded character/server state and the selected server.

## Adventure Land game data

ALRemastered loads the official browser game-data snapshot from `https://adventure.land/data.js`. That endpoint is generated by Adventure Land itself and includes the deployed `G` data plus live map geometry.

The client parses the `var G=<JSON>;` envelope strictly as JSON and does not evaluate the downloaded JavaScript.

The central in-memory game-data service makes these required families available to later runtime slices:

- `G.items`
- `G.monsters`
- `G.maps`
- `G.geometry`
- `G.skills`
- `G.classes`
- `G.npcs`
- `G.drops`
- `G.craft`
- `G.conditions`

It also surfaces additional families when present, including `G.dismantle`, `G.upgrades`, `G.compounds`, and `G.events`.

The dashboard shows **Game data status**, **Game data version**, **Loaded families**, **Loaded at**, **Game data source**, **Cache status**, **Cached at**, individual family counts, and a manual **Reload game data** action. If a later reload fails, the already loaded in-memory snapshot is retained.

Successful live snapshots are persisted in a versioned local cache. A complete new cache file is written and atomically renamed into place before older snapshots are cleaned up, so an interrupted write cannot replace a valid cache with a partial file. On startup ALRemastered can restore a valid cache before refreshing the live source. Cache data that conflicts with the last known Adventure Land version is not used, and corrupted cache files are ignored and replaced by the next valid live snapshot.

## Adventure Land game version

ALRemastered treats the live production `https://adventure.land/data.js` snapshot as the authoritative Adventure Land version source. Version detection and game-data loading share the same in-flight snapshot so they cannot disagree during the same refresh.

The last observed production version is stored locally and changes are detected against that baseline.

The dashboard shows:

- **Adventure Land version**
- **Game version status**
- **Last deploy** when the authoritative source provides it; otherwise **—**
- **Check game version**

The first successful online check creates the local baseline. If a later check sees a different game version, ALRemastered reports the previous and current values and records the change in the Debug Console. A failed online check keeps the last stored version available.

## Diagnostics foundation

The dashboard includes a diagnostics overview with component health for the Core, dashboard and updater, plus highlighted recent error cards. Error cards use an understandable English summary and expose **Technical details** separately.

Available diagnostic actions include:

- **Copy diagnostic snapshot**
- **Download diagnostic package**
- **Copy full log** directly from each recent error card

Diagnostic snapshots and packages are generated only from already sanitized runtime/log data.

For live validation during development, start ALRemastered with `--diagnostic-test-mode`. This opt-in flag generates three synthetic diagnostic errors without changing normal client behavior. Restart without the flag to return to the normal error-free state.

## Diagnostics

ALRemastered writes structured client logs to the platform user-data location:

- Windows: `%LOCALAPPDATA%\ALRemastered\logs\client.log`
- Linux: `$XDG_DATA_HOME/ALRemastered/logs/client.log` or `~/.local/share/ALRemastered/logs/client.log`

Logs use bounded in-memory retention and file rotation. Passwords, authorization values, cookies, tokens, API keys, session secrets, and similar sensitive values are sanitized before records are stored or exported.

All end-user-facing ALRemastered text is English.
