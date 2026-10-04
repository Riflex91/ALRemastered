export const SCRIPT_PACKAGE_PERMISSIONS = Object.freeze([
  "combat",
  "movement",
  "inventory.read",
  "inventory.use",
  "inventory.sell",
  "inventory.destroy",
  "trade",
  "gold.send",
  "item.send",
  "bank",
  "merchant",
  "character.communication",
  "storage",
  "network.external",
] as const);

export type ScriptPackagePermission = typeof SCRIPT_PACKAGE_PERMISSIONS[number];

export const DANGEROUS_SCRIPT_PACKAGE_PERMISSIONS = Object.freeze([
  "inventory.use",
  "inventory.sell",
  "inventory.destroy",
  "trade",
  "gold.send",
  "item.send",
  "bank",
  "merchant",
  "character.communication",
  "storage",
  "network.external",
] as const satisfies readonly ScriptPackagePermission[]);

const KNOWN = new Set<string>(SCRIPT_PACKAGE_PERMISSIONS);
const DANGEROUS = new Set<string>(DANGEROUS_SCRIPT_PACKAGE_PERMISSIONS);

export interface ScriptPackagePermissionGrant {
  readonly declared: readonly ScriptPackagePermission[];
  readonly approvedDangerous: readonly ScriptPackagePermission[];
}

export interface ScriptPackagePermissionDecision {
  readonly permission: string;
  readonly known: boolean;
  readonly dangerous: boolean;
  readonly declared: boolean;
  readonly explicitlyApproved: boolean;
  readonly allowed: boolean;
  readonly code:
    | "PACKAGE_PERMISSION_ALLOWED"
    | "PACKAGE_PERMISSION_UNKNOWN"
    | "PACKAGE_PERMISSION_NOT_DECLARED"
    | "PACKAGE_PERMISSION_REQUIRES_CONFIRMATION";
  readonly message: string;
}

export class ScriptPackagePermissionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ScriptPackagePermissionError";
    this.code = code;
  }
}

export function isScriptPackagePermission(value: unknown): value is ScriptPackagePermission {
  return typeof value === "string" && KNOWN.has(value);
}

export function isDangerousScriptPackagePermission(
  permission: ScriptPackagePermission,
): boolean {
  return DANGEROUS.has(permission);
}

function normalizePermissionList(
  values: readonly string[],
  label: string,
): readonly ScriptPackagePermission[] {
  const result: ScriptPackagePermission[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const permission = raw.trim();
    if (!isScriptPackagePermission(permission)) {
      throw new ScriptPackagePermissionError(
        "PACKAGE_PERMISSION_UNKNOWN",
        `${label} contains unsupported permission: ${permission || "(empty)"}.`,
      );
    }
    if (seen.has(permission)) {
      throw new ScriptPackagePermissionError(
        "PACKAGE_PERMISSION_DUPLICATE",
        `${label} must not contain duplicate permissions: ${permission}.`,
      );
    }
    seen.add(permission);
    result.push(permission);
  }
  return Object.freeze(result);
}

export function createScriptPackagePermissionGrant(input: {
  readonly declared: readonly string[];
  readonly approvedDangerous?: readonly string[];
}): ScriptPackagePermissionGrant {
  const declared = normalizePermissionList(input.declared, "declared permissions");
  const approvedDangerous = normalizePermissionList(
    input.approvedDangerous ?? [],
    "approved dangerous permissions",
  );

  for (const permission of approvedDangerous) {
    if (!isDangerousScriptPackagePermission(permission)) {
      throw new ScriptPackagePermissionError(
        "PACKAGE_PERMISSION_APPROVAL_INVALID",
        `Only dangerous permissions require explicit approval: ${permission}.`,
      );
    }
    if (!declared.includes(permission)) {
      throw new ScriptPackagePermissionError(
        "PACKAGE_PERMISSION_NOT_DECLARED",
        `Dangerous permission cannot be approved unless declared: ${permission}.`,
      );
    }
  }

  return Object.freeze({ declared, approvedDangerous });
}

export function authorizeScriptPackagePermission(
  grant: ScriptPackagePermissionGrant,
  permissionValue: string,
): ScriptPackagePermissionDecision {
  const permission = permissionValue.trim();
  if (!isScriptPackagePermission(permission)) {
    return Object.freeze({
      permission,
      known: false,
      dangerous: false,
      declared: false,
      explicitlyApproved: false,
      allowed: false,
      code: "PACKAGE_PERMISSION_UNKNOWN",
      message: `Unsupported package permission: ${permission || "(empty)"}.`,
    });
  }

  const dangerous = isDangerousScriptPackagePermission(permission);
  const declared = grant.declared.includes(permission);
  const explicitlyApproved = grant.approvedDangerous.includes(permission);

  if (!declared) {
    return Object.freeze({
      permission,
      known: true,
      dangerous,
      declared: false,
      explicitlyApproved: false,
      allowed: false,
      code: "PACKAGE_PERMISSION_NOT_DECLARED",
      message: `Package did not declare required permission: ${permission}.`,
    });
  }

  if (dangerous && !explicitlyApproved) {
    return Object.freeze({
      permission,
      known: true,
      dangerous: true,
      declared: true,
      explicitlyApproved: false,
      allowed: false,
      code: "PACKAGE_PERMISSION_REQUIRES_CONFIRMATION",
      message: `Dangerous package permission requires explicit approval: ${permission}.`,
    });
  }

  return Object.freeze({
    permission,
    known: true,
    dangerous,
    declared: true,
    explicitlyApproved,
    allowed: true,
    code: "PACKAGE_PERMISSION_ALLOWED",
    message: `Package permission allowed: ${permission}.`,
  });
}

export function scriptPackagePermissionDescriptor() {
  return Object.freeze({
    status: "ready",
    defaultPolicy: "deny" as const,
    permissionCount: SCRIPT_PACKAGE_PERMISSIONS.length,
    permissions: SCRIPT_PACKAGE_PERMISSIONS,
    dangerousPermissions: DANGEROUS_SCRIPT_PACKAGE_PERMISSIONS,
    safePermissions: Object.freeze(
      SCRIPT_PACKAGE_PERMISSIONS.filter((permission) => !DANGEROUS.has(permission)),
    ),
    dangerousDefaultAllowed: false,
    dangerousRequireExplicitApproval: true,
    undeclaredAllowed: false,
    unknownAllowed: false,
    importSupported: false,
    executionSupported: false,
  });
}

export function runScriptPackagePermissionSelfTest() {
  const declared = SCRIPT_PACKAGE_PERMISSIONS;
  const defaultGrant = createScriptPackagePermissionGrant({ declared });
  const explicitGrant = createScriptPackagePermissionGrant({
    declared,
    approvedDangerous: ["inventory.destroy", "gold.send", "network.external"],
  });

  const safeCombat = authorizeScriptPackagePermission(defaultGrant, "combat");
  const safeMovement = authorizeScriptPackagePermission(defaultGrant, "movement");
  const safeInventoryRead = authorizeScriptPackagePermission(defaultGrant, "inventory.read");
  const dangerousDestroyDefault = authorizeScriptPackagePermission(
    defaultGrant,
    "inventory.destroy",
  );
  const dangerousGoldDefault = authorizeScriptPackagePermission(defaultGrant, "gold.send");
  const dangerousNetworkDefault = authorizeScriptPackagePermission(
    defaultGrant,
    "network.external",
  );
  const dangerousDestroyApproved = authorizeScriptPackagePermission(
    explicitGrant,
    "inventory.destroy",
  );
  const dangerousGoldApproved = authorizeScriptPackagePermission(explicitGrant, "gold.send");
  const dangerousNetworkApproved = authorizeScriptPackagePermission(
    explicitGrant,
    "network.external",
  );
  const undeclared = authorizeScriptPackagePermission(
    createScriptPackagePermissionGrant({ declared: ["movement"] }),
    "combat",
  );
  const unknown = authorizeScriptPackagePermission(defaultGrant, "filesystem.write");

  const checks = Object.freeze({
    canonicalPermissions:
      SCRIPT_PACKAGE_PERMISSIONS.length === 14 &&
      SCRIPT_PACKAGE_PERMISSIONS.every((permission) => isScriptPackagePermission(permission)),
    safeDeclaredAllowed:
      safeCombat.allowed && safeMovement.allowed && safeInventoryRead.allowed,
    dangerousDefaultDenied:
      !dangerousDestroyDefault.allowed &&
      !dangerousGoldDefault.allowed &&
      !dangerousNetworkDefault.allowed &&
      dangerousDestroyDefault.code === "PACKAGE_PERMISSION_REQUIRES_CONFIRMATION",
    dangerousExplicitApprovalAllowed:
      dangerousDestroyApproved.allowed &&
      dangerousGoldApproved.allowed &&
      dangerousNetworkApproved.allowed,
    undeclaredDenied:
      !undeclared.allowed && undeclared.code === "PACKAGE_PERMISSION_NOT_DECLARED",
    unknownDenied:
      !unknown.allowed && unknown.code === "PACKAGE_PERMISSION_UNKNOWN",
    importAttempted: false,
    executionAttempted: false,
    gameplayMutation: false,
  });

  return Object.freeze({
    status: Object.values(checks).every((value) => value === true) ? "ready" : "failed",
    descriptor: scriptPackagePermissionDescriptor(),
    checks,
    sampleDecisions: Object.freeze({
      safeCombat,
      dangerousDestroyDefault,
      dangerousDestroyApproved,
      undeclared,
      unknown,
    }),
  });
}
