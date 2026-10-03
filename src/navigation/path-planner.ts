import type { Logger } from "../logging/logger.ts";
import { canTraverseDirect, euclideanDistance } from "./collision.ts";
import type {
  AdventureLandMapModelService,
  AdventureLandNavigationMap,
  AdventureLandNavigationModel,
  MapTransition,
} from "./map-model.ts";

export interface PathLocation {
  readonly map: string;
  readonly x: number;
  readonly y: number;
}

export type PathWaypointKind =
  | "start"
  | "spawn"
  | "door"
  | "arrival"
  | "target";

export interface PathWaypoint extends PathLocation {
  readonly kind: PathWaypointKind;
  readonly id: string;
  readonly transitionId?: string;
  readonly spawnIndex?: number;
}

export interface PathWalkLeg {
  readonly kind: "walk";
  readonly from: PathWaypoint;
  readonly to: PathWaypoint;
  readonly distance: number;
}

export interface PathTransitionLeg {
  readonly kind: "transition";
  readonly from: PathWaypoint;
  readonly to: PathWaypoint;
  readonly transitionId: string;
  readonly metadata: readonly (string | number | boolean | null)[];
}

export type PathLeg = PathWalkLeg | PathTransitionLeg;
export type PathPlanStatus = "reachable" | "unreachable" | "invalid";

export interface PathPlanDiagnostics {
  readonly candidateNodeCount: number;
  readonly walkEdgeCount: number;
  readonly transitionEdgeCount: number;
  readonly directChecks: number;
  readonly expandedNodes: number;
  readonly mapHops: number;
  readonly totalWalkDistance: number;
  readonly totalCost: number;
  readonly skippedIgnoredMaps: number;
  readonly skippedInvalidTransitions: number;
  readonly skippedConditionalTransitions: number;
  readonly visitedMaps: readonly string[];
}

export interface PathPlanResult {
  readonly status: PathPlanStatus;
  readonly message: string;
  readonly reasonCode?: string;
  readonly from: PathLocation;
  readonly to: PathLocation;
  readonly waypoints: readonly PathWaypoint[];
  readonly legs: readonly PathLeg[];
  readonly diagnostics: PathPlanDiagnostics;
}

export interface SimplePathPlannerState {
  readonly status: "ready" | "unavailable";
  readonly plannedRoutes: number;
  readonly reachableRoutes: number;
  readonly lastPlan?: PathPlanResult;
  readonly message: string;
}

export interface SimplePathPlannerOptions {
  readonly logger: Logger;
  readonly mapModel: Pick<AdventureLandMapModelService, "model">;
}

type GraphNode = {
  readonly id: string;
  readonly waypoint: PathWaypoint;
};

type GraphEdge = {
  readonly fromId: string;
  readonly toId: string;
  readonly cost: number;
  readonly leg: PathLeg;
};

type MutableDiagnostics = {
  candidateNodeCount: number;
  walkEdgeCount: number;
  transitionEdgeCount: number;
  directChecks: number;
  expandedNodes: number;
  mapHops: number;
  totalWalkDistance: number;
  totalCost: number;
  skippedIgnoredMaps: number;
  skippedInvalidTransitions: number;
  skippedConditionalTransitions: number;
  visitedMaps: string[];
};

const TRANSITION_COST = 48;

export class SimplePathPlannerService {
  readonly #logger: Logger;
  readonly #mapModel: SimplePathPlannerOptions["mapModel"];
  #plannedRoutes = 0;
  #reachableRoutes = 0;
  #lastPlan?: PathPlanResult;

  constructor(options: SimplePathPlannerOptions) {
    this.#logger = options.logger;
    this.#mapModel = options.mapModel;
  }

  state(): SimplePathPlannerState {
    const model = this.#mapModel.model();
    return Object.freeze({
      status: model ? "ready" : "unavailable",
      plannedRoutes: this.#plannedRoutes,
      reachableRoutes: this.#reachableRoutes,
      lastPlan: this.#lastPlan ? structuredClone(this.#lastPlan) : undefined,
      message: model
        ? "Simple path planner is ready."
        : "Simple path planner is waiting for the map/geometry model.",
    });
  }

  plan(from: PathLocation, to: PathLocation): PathPlanResult {
    this.#plannedRoutes += 1;
    const model = this.#mapModel.model();
    let result: PathPlanResult;
    if (!model) {
      result = invalidPlan(
        from,
        to,
        "PATH_MODEL_UNAVAILABLE",
        "The map/geometry model is unavailable.",
      );
    } else {
      result = planSimplePath(model, from, to);
    }

    if (result.status === "reachable") this.#reachableRoutes += 1;
    this.#lastPlan = result;
    this.#logger.info("Simple navigation route planned.", {
      status: result.status,
      reasonCode: result.reasonCode,
      fromMap: from.map,
      toMap: to.map,
      waypointCount: result.waypoints.length,
      legCount: result.legs.length,
      mapHops: result.diagnostics.mapHops,
      totalWalkDistance: Math.round(result.diagnostics.totalWalkDistance * 100) / 100,
      directChecks: result.diagnostics.directChecks,
      expandedNodes: result.diagnostics.expandedNodes,
    });
    return structuredClone(result);
  }
}

export function planSimplePath(
  model: AdventureLandNavigationModel,
  from: PathLocation,
  to: PathLocation,
): PathPlanResult {
  const basic = validateLocations(model, from, to);
  if (basic) return basic;

  const diagnostics: MutableDiagnostics = {
    candidateNodeCount: 0,
    walkEdgeCount: 0,
    transitionEdgeCount: 0,
    directChecks: 0,
    expandedNodes: 0,
    mapHops: 0,
    totalWalkDistance: 0,
    totalCost: 0,
    skippedIgnoredMaps: 0,
    skippedInvalidTransitions: 0,
    skippedConditionalTransitions: 0,
    visitedMaps: [],
  };

  const nodes = new Map<string, GraphNode>();
  const nodesByMap = new Map<string, GraphNode[]>();
  const transitions: Array<{
    readonly transition: MapTransition;
    readonly sourceNodeId: string;
    readonly targetNodeId: string;
  }> = [];

  for (const map of Object.values(model.maps)) {
    if (map.ignored) {
      diagnostics.skippedIgnoredMaps += 1;
      continue;
    }
    const mapNodes: GraphNode[] = [];
    for (let index = 0; index < map.spawnPoints.length; index += 1) {
      const spawn = map.spawnPoints[index]!;
      const node = graphNode({
        id: `${map.key}:spawn:${index}`,
        kind: "spawn",
        map: map.key,
        x: spawn.x,
        y: spawn.y,
        spawnIndex: index,
      });
      nodes.set(node.id, node);
      mapNodes.push(node);
    }
    for (const transition of map.transitions) {
      if (!transition.valid) {
        diagnostics.skippedInvalidTransitions += 1;
        continue;
      }
      if (transition.metadata.length > 0) {
        diagnostics.skippedConditionalTransitions += 1;
        continue;
      }
      if (
        transition.target.x === undefined ||
        transition.target.y === undefined ||
        model.maps[transition.target.map]?.ignored
      ) {
        diagnostics.skippedInvalidTransitions += 1;
        continue;
      }
      const node = graphNode({
        id: transition.id,
        kind: "door",
        map: map.key,
        x: transition.source.x,
        y: transition.source.y,
        spawnIndex: transition.source.spawnIndex,
        transitionId: transition.id,
      });
      nodes.set(node.id, node);
      mapNodes.push(node);
      transitions.push({
        transition,
        sourceNodeId: node.id,
        targetNodeId:
          `${transition.target.map}:spawn:${transition.target.spawnIndex}`,
      });
    }
    nodesByMap.set(map.key, mapNodes);
  }

  const start = graphNode({
    id: "__start__",
    kind: "start",
    map: from.map,
    x: from.x,
    y: from.y,
  });
  const target = graphNode({
    id: "__target__",
    kind: "target",
    map: to.map,
    x: to.x,
    y: to.y,
  });
  nodes.set(start.id, start);
  nodes.set(target.id, target);
  nodesByMap.set(
    from.map,
    [...(nodesByMap.get(from.map) ?? []), start],
  );
  nodesByMap.set(
    to.map,
    [...(nodesByMap.get(to.map) ?? []), target],
  );
  diagnostics.candidateNodeCount = nodes.size;

  const edges = new Map<string, GraphEdge[]>();
  const addEdge = (edge: GraphEdge) => {
    const list = edges.get(edge.fromId) ?? [];
    list.push(edge);
    edges.set(edge.fromId, list);
  };

  for (const [mapKey, mapNodes] of nodesByMap) {
    const map = model.maps[mapKey];
    if (!map || map.ignored) continue;
    for (let i = 0; i < mapNodes.length; i += 1) {
      for (let j = i + 1; j < mapNodes.length; j += 1) {
        const a = mapNodes[i]!;
        const b = mapNodes[j]!;
        let reachable = sameCoordinates(a.waypoint, b.waypoint);
        if (!reachable) {
          diagnostics.directChecks += 1;
          reachable = canTraverseDirect(
            map.collision,
            a.waypoint.x,
            a.waypoint.y,
            b.waypoint.x,
            b.waypoint.y,
          );
        }
        if (!reachable) continue;
        const distance = euclideanDistance(a.waypoint, b.waypoint);
        addEdge(walkEdge(a, b, distance));
        addEdge(walkEdge(b, a, distance));
        diagnostics.walkEdgeCount += 2;
      }
    }
  }

  for (const item of transitions) {
    const source = nodes.get(item.sourceNodeId);
    const targetSpawn = nodes.get(item.targetNodeId);
    if (!source || !targetSpawn) {
      diagnostics.skippedInvalidTransitions += 1;
      continue;
    }
    const arrival: PathWaypoint = Object.freeze({
      ...targetSpawn.waypoint,
      kind: "arrival",
      id: `${item.transition.id}:arrival`,
      transitionId: item.transition.id,
    });
    addEdge({
      fromId: source.id,
      toId: targetSpawn.id,
      cost: TRANSITION_COST,
      leg: Object.freeze({
        kind: "transition",
        from: source.waypoint,
        to: arrival,
        transitionId: item.transition.id,
        metadata: item.transition.metadata,
      }),
    });
    diagnostics.transitionEdgeCount += 1;
  }

  const search = shortestPath(nodes, edges, start.id, target.id, diagnostics);
  if (!search) {
    return Object.freeze({
      status: "unreachable",
      reasonCode: "PATH_NO_ROUTE",
      message:
        "No structurally reachable route was found with direct collision-safe walking segments and unconditional map transitions.",
      from: freezeLocation(from),
      to: freezeLocation(to),
      waypoints: Object.freeze([]),
      legs: Object.freeze([]),
      diagnostics: freezeDiagnostics(diagnostics),
    });
  }

  const legs = search.edges.map((edge) => edge.leg);
  const waypoints = buildWaypoints(start.waypoint, target.waypoint, legs);
  diagnostics.mapHops = legs.filter((leg) => leg.kind === "transition").length;
  diagnostics.totalWalkDistance = legs.reduce(
    (total, leg) => total + (leg.kind === "walk" ? leg.distance : 0),
    0,
  );
  diagnostics.totalCost = search.cost;
  diagnostics.visitedMaps = uniqueStrings(
    waypoints.map((waypoint) => waypoint.map),
  );

  return Object.freeze({
    status: "reachable",
    message: diagnostics.mapHops > 0
      ? `Reachable route found with ${diagnostics.mapHops} map transition(s).`
      : "Reachable route found on the current map.",
    from: freezeLocation(from),
    to: freezeLocation(to),
    waypoints,
    legs: Object.freeze(legs),
    diagnostics: freezeDiagnostics(diagnostics),
  });
}

function validateLocations(
  model: AdventureLandNavigationModel,
  from: PathLocation,
  to: PathLocation,
): PathPlanResult | undefined {
  for (const [label, location] of [["start", from], ["target", to]] as const) {
    if (
      typeof location.map !== "string" ||
      !location.map.trim() ||
      !Number.isFinite(location.x) ||
      !Number.isFinite(location.y)
    ) {
      return invalidPlan(
        from,
        to,
        "PATH_LOCATION_INVALID",
        `The ${label} location requires a map and finite x/y coordinates.`,
      );
    }
    const map = model.maps[location.map];
    if (!map) {
      return invalidPlan(
        from,
        to,
        "PATH_MAP_UNKNOWN",
        `The ${label} map ${location.map} is not present in the navigation model.`,
      );
    }
    if (map.ignored) {
      return invalidPlan(
        from,
        to,
        "PATH_MAP_IGNORED",
        `The ${label} map ${location.map} is marked ignored and is not routable.`,
      );
    }
    if (
      map.bounds &&
      (
        location.x < map.bounds.minX ||
        location.x > map.bounds.maxX ||
        location.y < map.bounds.minY ||
        location.y > map.bounds.maxY
      )
    ) {
      return invalidPlan(
        from,
        to,
        "PATH_LOCATION_OUT_OF_BOUNDS",
        `The ${label} location is outside the modeled bounds of ${location.map}.`,
      );
    }
  }
  if (
    from.map === to.map &&
    from.x === to.x &&
    from.y === to.y
  ) {
    return Object.freeze({
      status: "reachable",
      message: "The target is already reached.",
      from: freezeLocation(from),
      to: freezeLocation(to),
      waypoints: Object.freeze([
        Object.freeze({
          id: "__start__",
          kind: "start",
          map: from.map,
          x: from.x,
          y: from.y,
        }),
      ]),
      legs: Object.freeze([]),
      diagnostics: freezeDiagnostics({
        candidateNodeCount: 1,
        walkEdgeCount: 0,
        transitionEdgeCount: 0,
        directChecks: 0,
        expandedNodes: 0,
        mapHops: 0,
        totalWalkDistance: 0,
        totalCost: 0,
        skippedIgnoredMaps: 0,
        skippedInvalidTransitions: 0,
        skippedConditionalTransitions: 0,
        visitedMaps: [from.map],
      }),
    });
  }
  return undefined;
}

function shortestPath(
  nodes: ReadonlyMap<string, GraphNode>,
  edges: ReadonlyMap<string, readonly GraphEdge[]>,
  startId: string,
  targetId: string,
  diagnostics: MutableDiagnostics,
): { readonly cost: number; readonly edges: readonly GraphEdge[] } | undefined {
  const distances = new Map<string, number>([[startId, 0]]);
  const previous = new Map<string, GraphEdge>();
  const visited = new Set<string>();

  while (visited.size < nodes.size) {
    let currentId: string | undefined;
    let currentDistance = Number.POSITIVE_INFINITY;
    for (const [id, distance] of distances) {
      if (!visited.has(id) && distance < currentDistance) {
        currentDistance = distance;
        currentId = id;
      }
    }
    if (!currentId) break;
    if (currentId === targetId) break;
    visited.add(currentId);
    diagnostics.expandedNodes += 1;

    for (const edge of edges.get(currentId) ?? []) {
      if (visited.has(edge.toId)) continue;
      const candidate = currentDistance + edge.cost;
      if (candidate < (distances.get(edge.toId) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.toId, candidate);
        previous.set(edge.toId, edge);
      }
    }
  }

  const cost = distances.get(targetId);
  if (cost === undefined || !Number.isFinite(cost)) return undefined;

  const path: GraphEdge[] = [];
  let cursor = targetId;
  while (cursor !== startId) {
    const edge = previous.get(cursor);
    if (!edge) return undefined;
    path.push(edge);
    cursor = edge.fromId;
  }
  path.reverse();
  return Object.freeze({ cost, edges: Object.freeze(path) });
}

function graphNode(waypoint: PathWaypoint): GraphNode {
  return Object.freeze({
    id: waypoint.id,
    waypoint: Object.freeze({ ...waypoint }),
  });
}

function walkEdge(
  from: GraphNode,
  to: GraphNode,
  distance: number,
): GraphEdge {
  return Object.freeze({
    fromId: from.id,
    toId: to.id,
    cost: distance,
    leg: Object.freeze({
      kind: "walk",
      from: from.waypoint,
      to: to.waypoint,
      distance,
    }),
  });
}

function buildWaypoints(
  start: PathWaypoint,
  target: PathWaypoint,
  legs: readonly PathLeg[],
): readonly PathWaypoint[] {
  if (legs.length === 0) return Object.freeze([start]);
  const result: PathWaypoint[] = [start];
  for (const leg of legs) {
    const next = leg.to.id === "__target__"
      ? target
      : leg.to;
    const previous = result[result.length - 1];
    if (
      !previous ||
      previous.map !== next.map ||
      previous.x !== next.x ||
      previous.y !== next.y ||
      previous.kind !== next.kind
    ) {
      result.push(next);
    }
  }
  return Object.freeze(result);
}

function invalidPlan(
  from: PathLocation,
  to: PathLocation,
  reasonCode: string,
  message: string,
): PathPlanResult {
  return Object.freeze({
    status: "invalid",
    reasonCode,
    message,
    from: freezeLocation(from),
    to: freezeLocation(to),
    waypoints: Object.freeze([]),
    legs: Object.freeze([]),
    diagnostics: freezeDiagnostics({
      candidateNodeCount: 0,
      walkEdgeCount: 0,
      transitionEdgeCount: 0,
      directChecks: 0,
      expandedNodes: 0,
      mapHops: 0,
      totalWalkDistance: 0,
      totalCost: 0,
      skippedIgnoredMaps: 0,
      skippedInvalidTransitions: 0,
      skippedConditionalTransitions: 0,
      visitedMaps: [],
    }),
  });
}

function freezeLocation(location: PathLocation): PathLocation {
  return Object.freeze({
    map: location.map,
    x: location.x,
    y: location.y,
  });
}

function freezeDiagnostics(
  diagnostics: MutableDiagnostics,
): PathPlanDiagnostics {
  return Object.freeze({
    candidateNodeCount: diagnostics.candidateNodeCount,
    walkEdgeCount: diagnostics.walkEdgeCount,
    transitionEdgeCount: diagnostics.transitionEdgeCount,
    directChecks: diagnostics.directChecks,
    expandedNodes: diagnostics.expandedNodes,
    mapHops: diagnostics.mapHops,
    totalWalkDistance: diagnostics.totalWalkDistance,
    totalCost: diagnostics.totalCost,
    skippedIgnoredMaps: diagnostics.skippedIgnoredMaps,
    skippedInvalidTransitions: diagnostics.skippedInvalidTransitions,
    skippedConditionalTransitions: diagnostics.skippedConditionalTransitions,
    visitedMaps: Object.freeze([...diagnostics.visitedMaps]),
  });
}

function sameCoordinates(a: PathLocation, b: PathLocation): boolean {
  return a.map === b.map && a.x === b.x && a.y === b.y;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
