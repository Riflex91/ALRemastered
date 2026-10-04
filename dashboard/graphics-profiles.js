export const DEFAULT_GRAPHICS_PROFILE = "hd-auto";

export const GRAPHICS_PROFILE_IDS = Object.freeze([
  "original",
  "hd-performance",
  "hd-auto",
  "hd-maximum",
]);

const PROFILE_DEFINITIONS = Object.freeze({
  original: Object.freeze({
    id: "original",
    label: "Original",
    usesHd: false,
    textureCap: null,
    description: "Use original Adventure Land assets only.",
  }),
  "hd-performance": Object.freeze({
    id: "hd-performance",
    label: "HD Performance",
    usesHd: true,
    textureCap: 2048,
    description: "Prefer HD assets up to 2048px while retaining the hardware texture guard.",
  }),
  "hd-auto": Object.freeze({
    id: "hd-auto",
    label: "HD Auto",
    usesHd: true,
    textureCap: 4096,
    description: "Prefer HD assets up to 4096px while adapting to the detected hardware limit.",
  }),
  "hd-maximum": Object.freeze({
    id: "hd-maximum",
    label: "HD Maximum",
    usesHd: true,
    textureCap: null,
    description: "Use every eligible HD asset supported by the detected hardware limit.",
  }),
});

export function normalizeGraphicsProfile(value) {
  return GRAPHICS_PROFILE_IDS.includes(value) ? value : DEFAULT_GRAPHICS_PROFILE;
}

export function graphicsProfileDefinition(value) {
  return PROFILE_DEFINITIONS[normalizeGraphicsProfile(value)];
}

export function graphicsProfileUsesHd(value) {
  return graphicsProfileDefinition(value).usesHd;
}

export function resolveGraphicsProfileTextureLimit(value, hardwareLimit) {
  const profile = graphicsProfileDefinition(value);
  if (!profile.usesHd) return null;

  const normalizedHardware =
    Number.isInteger(hardwareLimit) && hardwareLimit > 0 ? hardwareLimit : null;
  if (profile.textureCap === null) return normalizedHardware;
  if (normalizedHardware === null) return profile.textureCap;
  return Math.min(normalizedHardware, profile.textureCap);
}
