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

ALRemastered checks the repository's public GitHub Releases at startup and periodically while running. The dashboard also provides **Check for updates**.

When a newer version is available, the dashboard shows:

- **Install update**
- **Skip this version**
- **Remind me tomorrow**
- release notes
- current/new version
- download progress

Updates are never installed without an explicit **Install update** action. The Core selects the installer for the current operating system and architecture, downloads it from the official `Riflex91/ALRemastered` GitHub Release, and verifies its exact file size and SHA-256 digest before scheduling installation. A checksum mismatch blocks installation and is written to the Debug Console.

**Skip this version** applies only to that exact version. **Remind me tomorrow** suppresses the same version for 24 hours. A newer version overrides either choice.

Release publication is handled by the `Publish release` GitHub Actions workflow so Windows, Linux and `ALRemastered-update.json` are produced from one commit.

## Diagnostics

ALRemastered writes structured client logs to the platform user-data location:

- Windows: `%LOCALAPPDATA%\ALRemastered\logs\client.log`
- Linux: `$XDG_DATA_HOME/ALRemastered/logs/client.log` or `~/.local/share/ALRemastered/logs/client.log`

Logs use bounded in-memory retention and file rotation. Passwords, authorization values, cookies, tokens, API keys, session secrets, and similar sensitive values are sanitized before records are stored or exported.

All end-user-facing ALRemastered text is English.
