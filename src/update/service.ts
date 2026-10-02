import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, rmSync } from "node:fs";
import { once } from "node:events";
import { join } from "node:path";
import type { Logger } from "../logging/logger.ts";
import type { UpdateAsset, UpdateManifest, UpdateState } from "./model.ts";
import type { UpdatePreferenceStore } from "./preferences.ts";
import type { GitHubReleaseSource } from "./source.ts";
import { isNewerVersion } from "./version.ts";

export interface UpdateServiceOptions {
  readonly currentVersion: string;
  readonly logger: Logger;
  readonly source: Pick<GitHubReleaseSource, "latestManifest">;
  readonly preferences: UpdatePreferenceStore;
  readonly updatesDir: string;
  readonly platform?: NodeJS.Platform;
  readonly arch?: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
  readonly checkIntervalMs?: number;
  readonly scheduleInstaller: (path: string) => void | Promise<void>;
  readonly onInstallScheduled?: () => void;
}

export class UpdateService {
  readonly #currentVersion: string;
  readonly #logger: Logger;
  readonly #source: Pick<GitHubReleaseSource, "latestManifest">;
  readonly #preferences: UpdatePreferenceStore;
  readonly #updatesDir: string;
  readonly #platform: NodeJS.Platform;
  readonly #arch: string;
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;
  readonly #checkIntervalMs: number;
  readonly #scheduleInstaller: (path: string) => void | Promise<void>;
  readonly #onInstallScheduled?: () => void;
  #state: UpdateState;
  #manifest?: UpdateManifest;
  #timer?: NodeJS.Timeout;
  #checking?: Promise<UpdateState>;

  constructor(options: UpdateServiceOptions) {
    this.#currentVersion = options.currentVersion;
    this.#logger = options.logger;
    this.#source = options.source;
    this.#preferences = options.preferences;
    this.#updatesDir = options.updatesDir;
    this.#platform = options.platform ?? process.platform;
    this.#arch = normalizeArchitecture(options.arch ?? process.arch);
    this.#fetch = options.fetchImpl ?? fetch;
    this.#now = options.now ?? (() => new Date());
    this.#checkIntervalMs = options.checkIntervalMs ?? 6 * 60 * 60 * 1000;
    this.#scheduleInstaller = options.scheduleInstaller;
    this.#onInstallScheduled = options.onInstallScheduled;
    this.#state = Object.freeze({
      status: "idle",
      currentVersion: this.#currentVersion,
    });
  }

  state(): UpdateState {
    return structuredClone(this.#state);
  }

  start(): void {
    if (this.#timer) return;
    void this.checkNow(false);
    this.#timer = setInterval(() => void this.checkNow(false), this.#checkIntervalMs);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  checkNow(manual = true): Promise<UpdateState> {
    if (this.#checking) return this.#checking;
    this.#checking = this.#performCheck(manual).finally(() => {
      this.#checking = undefined;
    });
    return this.#checking;
  }

  skipVersion(): UpdateState {
    if (!this.#manifest || !isNewerVersion(this.#manifest.version, this.#currentVersion)) {
      throw new Error("There is no available update to skip.");
    }

    this.#preferences.save({ skippedVersion: this.#manifest.version });
    this.#setState({
      status: "deferred",
      currentVersion: this.#currentVersion,
      latestVersion: this.#manifest.version,
      publishedAt: this.#manifest.publishedAt,
      releaseNotesUrl: this.#manifest.releaseNotesUrl,
      message: "This version will be skipped.",
      checkedAt: this.#now().toISOString(),
    });
    this.#logger.info("Update version skipped.", { version: this.#manifest.version });
    return this.state();
  }

  remindTomorrow(): UpdateState {
    if (!this.#manifest || !isNewerVersion(this.#manifest.version, this.#currentVersion)) {
      throw new Error("There is no available update to defer.");
    }

    const until = new Date(this.#now().getTime() + 24 * 60 * 60 * 1000).toISOString();
    this.#preferences.save({
      snoozedVersion: this.#manifest.version,
      snoozedUntil: until,
    });
    this.#setState({
      status: "deferred",
      currentVersion: this.#currentVersion,
      latestVersion: this.#manifest.version,
      publishedAt: this.#manifest.publishedAt,
      releaseNotesUrl: this.#manifest.releaseNotesUrl,
      message: "This update will be shown again tomorrow.",
      checkedAt: this.#now().toISOString(),
    });
    this.#logger.info("Update reminder deferred for 24 hours.", {
      version: this.#manifest.version,
      until,
    });
    return this.state();
  }

  async installUpdate(): Promise<UpdateState> {
    if (!this.#manifest || !isNewerVersion(this.#manifest.version, this.#currentVersion)) {
      throw new Error("There is no available update to install.");
    }

    const asset = selectAsset(this.#manifest, this.#platform, this.#arch);
    const versionDir = join(this.#updatesDir, this.#manifest.version);
    const destination = join(versionDir, asset.fileName);
    mkdirSync(versionDir, { recursive: true });

    this.#setState({
      ...this.#state,
      status: "downloading",
      progressPercent: 0,
      message: "Downloading update…",
    });

    this.#logger.info("Update download started.", {
      version: this.#manifest.version,
      asset: asset.fileName,
      sizeBytes: asset.sizeBytes,
    });

    try {
      await downloadAndVerify(asset, destination, this.#fetch, (progressPercent) => {
        this.#setState({
          ...this.#state,
          status: "downloading",
          progressPercent,
          message: "Downloading update…",
        });
      });

      this.#setState({
        ...this.#state,
        status: "installing",
        progressPercent: 100,
        message: "Update verified. Installing automatically…",
      });
      this.#logger.info("Update integrity verified.", {
        version: this.#manifest.version,
        asset: asset.fileName,
        algorithm: "sha256",
      });

      await this.#scheduleInstaller(destination);
      this.#logger.info("Verified update installer scheduled.", {
        version: this.#manifest.version,
        asset: asset.fileName,
      });
      this.#onInstallScheduled?.();
      return this.state();
    } catch (error) {
      rmSync(destination, { force: true });
      const message = error instanceof Error ? error.message : String(error);
      this.#setState({
        ...this.#state,
        status: "error",
        progressPercent: undefined,
        message,
      });
      this.#logger.error("Update installation preparation failed.", error, {
        version: this.#manifest.version,
        asset: asset.fileName,
      });
      throw error;
    }
  }

  async #performCheck(manual: boolean): Promise<UpdateState> {
    const previous = this.#state;
    this.#setState({
      ...previous,
      status: "checking",
      message: manual ? "Checking for updates…" : previous.message,
    });

    try {
      const manifest = await this.#source.latestManifest();
      const checkedAt = this.#now().toISOString();

      if (!manifest || !isNewerVersion(manifest.version, this.#currentVersion)) {
        this.#manifest = manifest ?? undefined;
        this.#setState({
          status: "upToDate",
          currentVersion: this.#currentVersion,
          latestVersion: manifest?.version,
          message: manual ? "ALRemastered is up to date." : undefined,
          checkedAt,
        });
        if (manual) this.#logger.info("Manual update check completed. No newer version was found.");
        return this.state();
      }

      this.#manifest = manifest;
      const preferences = this.#preferences.load();
      const now = this.#now();

      if (preferences.skippedVersion === manifest.version) {
        this.#setState({
          status: "deferred",
          currentVersion: this.#currentVersion,
          latestVersion: manifest.version,
          publishedAt: manifest.publishedAt,
          releaseNotesUrl: manifest.releaseNotesUrl,
          message: "This version is skipped.",
          checkedAt,
        });
        return this.state();
      }

      if (
        preferences.snoozedVersion === manifest.version &&
        preferences.snoozedUntil &&
        Date.parse(preferences.snoozedUntil) > now.getTime()
      ) {
        this.#setState({
          status: "deferred",
          currentVersion: this.#currentVersion,
          latestVersion: manifest.version,
          publishedAt: manifest.publishedAt,
          releaseNotesUrl: manifest.releaseNotesUrl,
          message: "Update reminder is snoozed.",
          checkedAt,
        });
        return this.state();
      }

      this.#setState({
        status: "available",
        currentVersion: this.#currentVersion,
        latestVersion: manifest.version,
        publishedAt: manifest.publishedAt,
        releaseNotesUrl: manifest.releaseNotesUrl,
        message: "A new ALRemastered version is available.",
        checkedAt,
      });
      this.#logger.info("New ALRemastered version found.", {
        currentVersion: this.#currentVersion,
        latestVersion: manifest.version,
      });
      return this.state();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#setState({
        ...previous,
        status: "error",
        message,
        checkedAt: this.#now().toISOString(),
      });
      this.#logger.error("Update check failed.", error);
      return this.state();
    }
  }

  #setState(state: UpdateState): void {
    this.#state = Object.freeze(state);
  }
}

export async function downloadAndVerify(
  asset: UpdateAsset,
  destination: string,
  fetchImpl: typeof fetch = fetch,
  onProgress: (percent: number) => void = () => undefined,
): Promise<void> {
  const response = await fetchImpl(asset.url, {
    headers: { "User-Agent": "ALRemastered" },
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  if (!response.ok) throw new Error(`Update download failed with HTTP ${response.status}.`);
  if (!response.body) throw new Error("Update download returned no response body.");

  const hash = createHash("sha256");
  const stream = createWriteStream(destination, { flags: "w" });
  const reader = response.body.getReader();
  let received = 0;

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const bytes = Buffer.from(chunk.value);
      received += bytes.length;
      hash.update(bytes);
      if (!stream.write(bytes)) await once(stream, "drain");
      onProgress(Math.min(99, Math.floor((received / asset.sizeBytes) * 100)));
    }
    stream.end();
    await once(stream, "finish");
  } catch (error) {
    stream.destroy();
    throw error;
  }

  if (received !== asset.sizeBytes) {
    throw new Error(`Update size verification failed. Expected ${asset.sizeBytes} bytes, received ${received}.`);
  }

  const digest = hash.digest("hex");
  if (digest !== asset.sha256.toLowerCase()) {
    throw new Error("Update integrity verification failed. The SHA-256 checksum does not match.");
  }

  onProgress(100);
}

function selectAsset(manifest: UpdateManifest, platform: NodeJS.Platform, arch: string): UpdateAsset {
  const asset = manifest.assets.find((candidate) => candidate.platform === platform && candidate.arch === arch);
  if (!asset) throw new Error(`No update installer is available for ${platform}-${arch}.`);
  return asset;
}

function normalizeArchitecture(arch: string): "x64" | "arm64" {
  if (arch === "x64" || arch === "arm64") return arch;
  throw new Error(`Update installation is not supported on architecture ${arch}.`);
}
