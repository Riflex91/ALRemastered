export type AdventureLandEntityKind = "player" | "monster";

export interface AdventureLandVisibleEntity {
  readonly id: string;
  readonly kind: AdventureLandEntityKind;
  readonly name: string;
  readonly type: string;
  readonly map?: string;
  readonly x?: number;
  readonly y?: number;
  readonly hp?: number;
  readonly maxHp?: number;
  readonly level?: number;
  readonly target?: string;
  readonly party?: string;
}

export interface AdventureLandPartyMemberState {
  readonly name: string;
  readonly type?: string;
  readonly level?: number;
  readonly map?: string;
  readonly instance?: string;
  readonly x?: number;
  readonly y?: number;
  readonly hp?: number;
  readonly maxHp?: number;
  readonly mp?: number;
  readonly maxMp?: number;
  readonly dead?: boolean;
}

export interface AdventureLandPartyState {
  readonly inParty: boolean;
  readonly leader?: string;
  readonly members: readonly string[];
  readonly details: Readonly<Record<string, AdventureLandPartyMemberState>>;
}

export interface AdventureLandWorldState {
  readonly entities: readonly AdventureLandVisibleEntity[];
  readonly party: AdventureLandPartyState;
}

export function emptyWorldState(): AdventureLandWorldState {
  return Object.freeze({
    entities: Object.freeze([]),
    party: emptyPartyState(),
  });
}

export function applyEntityPacket(
  current: AdventureLandWorldState,
  data: Record<string, unknown>,
): AdventureLandWorldState {
  const entities = new Map(current.entities.map((entity) => [entity.id, entity]));
  if (data.type === "all") entities.clear();

  applyEntityList(entities, data.players, "player");
  applyEntityList(entities, data.monsters, "monster");

  return Object.freeze({
    ...current,
    entities: Object.freeze(
      [...entities.values()].sort((left, right) => left.id.localeCompare(right.id)),
    ),
  });
}

export function removeVisibleEntity(
  current: AdventureLandWorldState,
  id: unknown,
): AdventureLandWorldState {
  if (typeof id !== "string" || !id) return current;
  const next = current.entities.filter((entity) => entity.id !== id);
  if (next.length === current.entities.length) return current;
  return Object.freeze({
    ...current,
    entities: Object.freeze(next),
  });
}

export function clearVisibleEntities(
  current: AdventureLandWorldState,
): AdventureLandWorldState {
  if (!current.entities.length) return current;
  return Object.freeze({
    ...current,
    entities: Object.freeze([]),
  });
}

export function applyPartyPacket(
  current: AdventureLandWorldState,
  data: Record<string, unknown>,
): AdventureLandWorldState {
  const members = Array.isArray(data.list)
    ? data.list.filter((entry): entry is string => typeof entry === "string" && Boolean(entry))
    : [];

  const details: Record<string, AdventureLandPartyMemberState> = {};
  if (isRecord(data.party)) {
    for (const [name, raw] of Object.entries(data.party)) {
      if (!isRecord(raw)) continue;
      details[name] = Object.freeze({
        name,
        type: stringValue(raw.type) ?? stringValue(raw.ctype),
        level: finiteNumber(raw.level),
        map: stringValue(raw.map),
        instance: stringValue(raw.in),
        x: finiteNumber(raw.x),
        y: finiteNumber(raw.y),
        hp: finiteNumber(raw.hp),
        maxHp: finiteNumber(raw.max_hp),
        mp: finiteNumber(raw.mp),
        maxMp: finiteNumber(raw.max_mp),
        dead: "rip" in raw ? Boolean(raw.rip) : undefined,
      });
    }
  }

  return Object.freeze({
    ...current,
    party: Object.freeze({
      inParty: members.length >= 2,
      leader: members.length >= 2 ? members[0] : undefined,
      members: Object.freeze([...members]),
      details: Object.freeze(details),
    }),
  });
}

function applyEntityList(
  entities: Map<string, AdventureLandVisibleEntity>,
  value: unknown,
  kind: AdventureLandEntityKind,
): void {
  if (!Array.isArray(value)) return;
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const parsed = parseEntity(raw, kind);
    if (!parsed) continue;
    entities.set(parsed.id, parsed);
  }
}

function parseEntity(
  raw: Record<string, unknown>,
  kind: AdventureLandEntityKind,
): AdventureLandVisibleEntity | undefined {
  const id = stringValue(raw.id) ?? stringValue(raw.name);
  if (!id) return undefined;

  const rawType = kind === "monster"
    ? stringValue(raw.mtype) ?? stringValue(raw.type)
    : stringValue(raw.ctype) ?? stringValue(raw.type);
  const type = rawType && rawType !== "character" && rawType !== "monster"
    ? rawType
    : kind;

  return Object.freeze({
    id,
    kind,
    name: stringValue(raw.name) ?? id,
    type,
    map: stringValue(raw.map),
    x: finiteNumber(raw.x),
    y: finiteNumber(raw.y),
    hp: finiteNumber(raw.hp),
    maxHp: finiteNumber(raw.max_hp),
    level: finiteNumber(raw.level),
    target: stringValue(raw.target),
    party: stringValue(raw.party),
  });
}

function emptyPartyState(): AdventureLandPartyState {
  return Object.freeze({
    inParty: false,
    members: Object.freeze([]),
    details: Object.freeze({}),
  });
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
