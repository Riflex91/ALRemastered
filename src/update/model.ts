export type UpdateStatus =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "deferred"
  | "downloading"
  | "installing"
  | "error";

export interface UpdateAsset {
  readonly platform: "win32" | "linux";
  readonly arch: "x64" | "arm64";
  readonly fileName: string;
  readonly url: string;
  readonly sha256: string;
  readonly sizeBytes: number;
}

export interface UpdateManifest {
  readonly schemaVersion: 1;
  readonly product: "ALRemastered";
  readonly channel: "stable";
  readonly version: string;
  readonly publishedAt: string;
  readonly releaseNotesUrl: string;
  readonly assets: readonly UpdateAsset[];
}

export interface UpdateState {
  readonly status: UpdateStatus;
  readonly currentVersion: string;
  readonly latestVersion?: string;
  readonly publishedAt?: string;
  readonly releaseNotesUrl?: string;
  readonly progressPercent?: number;
  readonly message?: string;
  readonly checkedAt?: string;
}
