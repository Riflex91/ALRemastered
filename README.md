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

All end-user-facing ALRemastered text is English.
