import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, normalize, sep } from "node:path";

export interface AlhdAssetReplacement {
  readonly sourcePath: string;
  readonly hdPath: string;
  readonly scale: number;
  readonly state: string;
  readonly preserveLogicalSize: boolean;
  readonly originalFallback: boolean;
  readonly originalPixels?: {
    readonly width: number;
    readonly height: number;
  };
  readonly hdPixels?: {
    readonly width: number;
    readonly height: number;
  };
}

export interface AlhdAssetManifest {
  readonly schemaVersion: number;
  readonly phase?: string;
  readonly rules?: {
    readonly preserveLogicalSize?: boolean;
    readonly originalFallbackRequired?: boolean;
  };
  readonly replacements: readonly AlhdAssetReplacement[];
}

export interface AlhdAssetProviderState {
  readonly schemaVersion: 1;
  readonly status: "ready" | "fallback";
  readonly manifestStatus: "loaded" | "missing" | "invalid";
  readonly manifestName: string;
  readonly sourceRef: string;
  readonly manifestSchemaVersion?: number;
  readonly phase?: string;
  readonly replacementCount: number;
  readonly activeReplacementCount: number;
  readonly availableHdFiles: number;
  readonly missingHdFiles: number;
  readonly presentationOnly: true;
  readonly originalFallback: true;
  readonly gameplaySemanticChanges: false;
  readonly message: string;
}

export interface AlhdAssetResolution {
  readonly schemaVersion: 1;
  readonly sourcePath: string;
  readonly resolvedPath: string;
  readonly mode: "hd" | "original";
  readonly reason:
    | "hd-available"
    | "not-in-manifest"
    | "hd-file-missing"
    | "manifest-unavailable";
  readonly presentationOnly: true;
  readonly originalFallback: true;
}

export interface AlhdAssetProviderOptions {
  readonly manifestPath: string;
  readonly hdAssetRoot: string;
  readonly sourceRef: string;
  readonly fileExists?: (path: string) => boolean;
  readonly readText?: (path: string) => string;
}

export class AlhdAssetProvider {
  readonly #manifestPath: string;
  readonly #hdAssetRoot: string;
  readonly #sourceRef: string;
  readonly #fileExists: (path: string) => boolean;
  readonly #readText: (path: string) => string;
  #manifest?: AlhdAssetManifest;
  #manifestStatus: AlhdAssetProviderState["manifestStatus"] = "missing";
  #message = "ALHD manifest has not been loaded.";

  constructor(options: AlhdAssetProviderOptions) {
    this.#manifestPath = options.manifestPath;
    this.#hdAssetRoot = options.hdAssetRoot;
    this.#sourceRef = options.sourceRef;
    this.#fileExists = options.fileExists ?? existsSync;
    this.#readText = options.readText ?? ((path) => readFileSync(path, "utf8"));
    this.reload();
  }

  reload(): AlhdAssetProviderState {
    this.#manifest = undefined;

    if (!this.#fileExists(this.#manifestPath)) {
      this.#manifestStatus = "missing";
      this.#message = "ALHD manifest is missing; original Adventure Land assets remain authoritative.";
      return this.state();
    }

    try {
      const parsed = JSON.parse(this.#readText(this.#manifestPath));
      this.#manifest = validateManifest(parsed);
      this.#manifestStatus = "loaded";
      this.#message =
        "ALHD manifest loaded for presentation-only asset resolution with original fallback.";
    } catch (error) {
      this.#manifestStatus = "invalid";
      this.#message =
        `ALHD manifest is invalid; original Adventure Land assets remain authoritative: ${error instanceof Error ? error.message : String(error)}`;
    }

    return this.state();
  }

  state(): AlhdAssetProviderState {
    const replacements = this.#manifest?.replacements ?? [];
    const active = replacements.filter((entry) => entry.state === "active");
    let availableHdFiles = 0;
    for (const entry of active) {
      if (this.#fileExists(this.#hdAssetFile(entry.hdPath))) {
        availableHdFiles += 1;
      }
    }

    return Object.freeze({
      schemaVersion: 1 as const,
      status: this.#manifestStatus === "loaded" ? "ready" : "fallback",
      manifestStatus: this.#manifestStatus,
      manifestName: basename(this.#manifestPath),
      sourceRef: this.#sourceRef,
      manifestSchemaVersion: this.#manifest?.schemaVersion,
      phase: this.#manifest?.phase,
      replacementCount: replacements.length,
      activeReplacementCount: active.length,
      availableHdFiles,
      missingHdFiles: Math.max(0, active.length - availableHdFiles),
      presentationOnly: true as const,
      originalFallback: true as const,
      gameplaySemanticChanges: false as const,
      message: this.#message,
    });
  }

  resolve(sourcePath: string): AlhdAssetResolution {
    const source = normalizeAssetPath(sourcePath, "sourcePath");
    const manifest = this.#manifest;
    if (!manifest) {
      return originalResolution(source, "manifest-unavailable");
    }

    const replacement = manifest.replacements.find((entry) =>
      entry.state === "active" && entry.sourcePath === source
    );
    if (!replacement) {
      return originalResolution(source, "not-in-manifest");
    }

    const hdFile = this.#hdAssetFile(replacement.hdPath);
    if (!this.#fileExists(hdFile)) {
      return originalResolution(source, "hd-file-missing");
    }

    return Object.freeze({
      schemaVersion: 1 as const,
      sourcePath: source,
      resolvedPath: replacement.hdPath,
      mode: "hd" as const,
      reason: "hd-available" as const,
      presentationOnly: true as const,
      originalFallback: true as const,
    });
  }

  #hdAssetFile(hdPath: string): string {
    const relative = normalizeAssetPath(hdPath, "hdPath");
    return join(this.#hdAssetRoot, ...relative.split("/"));
  }
}

function validateManifest(value: unknown): AlhdAssetManifest {
  if (!value || typeof value !== "object") {
    throw new Error("manifest root must be an object");
  }
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1) {
    throw new Error("unsupported manifest schemaVersion");
  }
  if (!Array.isArray(raw.replacements)) {
    throw new Error("manifest replacements must be an array");
  }
  const rules = raw.rules && typeof raw.rules === "object"
    ? raw.rules as Record<string, unknown>
    : undefined;
  if (rules?.originalFallbackRequired !== true) {
    throw new Error("manifest must require original fallback");
  }
  if (rules?.preserveLogicalSize !== true) {
    throw new Error("manifest must preserve logical size");
  }

  const replacements = raw.replacements.map((entry, index) =>
    validateReplacement(entry, index)
  );
  return Object.freeze({
    schemaVersion: 1,
    phase: typeof raw.phase === "string" ? raw.phase : undefined,
    rules: {
      preserveLogicalSize: true,
      originalFallbackRequired: true,
    },
    replacements: Object.freeze(replacements),
  });
}

function validateReplacement(value: unknown, index: number): AlhdAssetReplacement {
  if (!value || typeof value !== "object") {
    throw new Error(`replacement ${index} must be an object`);
  }
  const raw = value as Record<string, unknown>;
  const sourcePath = normalizeAssetPath(raw.sourcePath, `replacement ${index} sourcePath`);
  const hdPath = normalizeAssetPath(raw.hdPath, `replacement ${index} hdPath`);
  if (typeof raw.scale !== "number" || !Number.isFinite(raw.scale) || raw.scale <= 0) {
    throw new Error(`replacement ${index} scale must be positive`);
  }
  if (typeof raw.state !== "string" || !raw.state.trim()) {
    throw new Error(`replacement ${index} state is required`);
  }
  if (raw.state === "active" && raw.preserveLogicalSize !== true) {
    throw new Error(`replacement ${index} must preserve logical size`);
  }
  if (raw.state === "active" && raw.originalFallback !== true) {
    throw new Error(`replacement ${index} must support original fallback`);
  }

  return Object.freeze({
    sourcePath,
    hdPath,
    scale: raw.scale,
    state: raw.state,
    preserveLogicalSize: raw.preserveLogicalSize === true,
    originalFallback: raw.originalFallback === true,
    originalPixels: dimensions(raw.originalPixels),
    hdPixels: dimensions(raw.hdPixels),
  });
}

function dimensions(value: unknown): { readonly width: number; readonly height: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.width !== "number" ||
    typeof raw.height !== "number" ||
    !Number.isFinite(raw.width) ||
    !Number.isFinite(raw.height) ||
    raw.width <= 0 ||
    raw.height <= 0
  ) {
    return undefined;
  }
  return Object.freeze({ width: raw.width, height: raw.height });
}

function normalizeAssetPath(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty relative path`);
  }
  const slashPath = value.trim().replaceAll("\\", "/");
  if (slashPath.startsWith("/") || isAbsolute(slashPath)) {
    throw new Error(`${label} must be relative`);
  }
  const normalized = normalize(slashPath).split(sep).join("/");
  if (normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`${label} must stay inside the asset root`);
  }
  return normalized;
}

function originalResolution(
  sourcePath: string,
  reason: AlhdAssetResolution["reason"],
): AlhdAssetResolution {
  return Object.freeze({
    schemaVersion: 1 as const,
    sourcePath,
    resolvedPath: sourcePath,
    mode: "original" as const,
    reason,
    presentationOnly: true as const,
    originalFallback: true as const,
  });
}
