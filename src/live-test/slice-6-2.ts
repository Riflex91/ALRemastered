import { randomUUID } from "node:crypto";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type { AdventureLandGameDataService } from "../game/data-service.ts";
import type { Logger } from "../logging/logger.ts";
import { canTraverseDirect } from "../navigation/collision.ts";
import type {
  AdventureLandMapModelService,
  AdventureLandNavigationMap,
  MapTransition,
} from "../navigation/map-model.ts";
import type {
  PathPlanResult,
  SimplePathPlannerService,
} from "../navigation/path-planner.ts";

export type Slice62LiveTestOutcome = "passed" | "blocked" | "failed";

export interface Slice62LiveTestStep {
  readonly name: string;
  readonly outcome: "passed";
  readonly message: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface Slice62LiveTestResult {
  readonly testId: string;
  readonly slice: "6.2";
  readonly outcome: Slice62LiveTestOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly message: string;
  readonly steps: readonly Slice62LiveTestStep[];
  readonly route?: PathPlanResult;
  readonly error?: Readonly<{
    code: string;
    step: string;
    message: string;
  }>;
}

export interface Slice62LiveTestState {
  readonly status: "idle" | "running" | Slice62LiveTestOutcome;
  readonly message: string;
  readonly lastResult?: Slice62LiveTestResult;
}

export interface Slice62LiveTestServiceOptions {
  readonly logger: Logger;
  readonly gameData: Pick<
    AdventureLandGameDataService,
    "state" | "data" | "loadNow"
  >;
  readonly mapModel: Pick<
    AdventureLandMapModelService,
    "state" | "model"
  >;
  readonly planner: Pick<
    SimplePathPlannerService,
    "state" | "plan"
  >;
  readonly character: Pick<AdventureLandCharacterService, "state">;
  readonly clock?: () => Date;
  readonly idFactory?: () => string;
}

export class Slice62LiveTestService {
  readonly #logger: Logger;
  readonly #gameData: Slice62LiveTestServiceOptions["gameData"];
  readonly #mapModel: Slice62LiveTestServiceOptions["mapModel"];
  readonly #planner: Slice62LiveTestServiceOptions["planner"];
  readonly #character: Slice62LiveTestServiceOptions["character"];
  readonly #clock: () => Date;
  readonly #idFactory: () => string;
  #running?: Promise<Slice62LiveTestResult>;
  #state: Slice62LiveTestState = Object.freeze({
    status: "idle",
    message: "Slice 6.2 simple path-planner test is ready.",
  });

  constructor(options: Slice62LiveTestServiceOptions) {
    this.#logger = options.logger;
    this.#gameData = options.gameData;
    this.#mapModel = options.mapModel;
    this.#planner = options.planner;
    this.#character = options.character;
    this.#clock = options.clock ?? (() => new Date());
    this.#idFactory = options.idFactory ?? (() => `live62-${randomUUID()}`);
  }

  state(): Slice62LiveTestState {
    return structuredClone(this.#state);
  }

  run(): Promise<Slice62LiveTestResult> {
    if (this.#running) return this.#running;
    this.#running = this.#runInternal().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #runInternal(): Promise<Slice62LiveTestResult> {
    const testId = this.#idFactory();
    const startedAt = this.#clock().toISOString();
    const steps: Slice62LiveTestStep[] = [];
    const characterBefore = this.#character.state();
    this.#state = Object.freeze({
      status: "running",
      message: "Slice 6.2 is planning and validating a passive live-data route.",
    });
    this.#logger.info("Slice 6.2 simple path-planner test started.", {
      testId,
      characterRequired: false,
      gameplayMutation: false,
      rawSocketAccess: false,
      movementExecution: false,
    });

    try {
      await this.#gameData.loadNow(true);
      const data = this.#gameData.data();
      if (!data || this.#gameData.state().status !== "loaded") {
        throw new Slice62Failure(
          "LIVE_TEST_GAME_DATA_UNAVAILABLE",
          "Adventure Land game data could not be refreshed for the path-planner test.",
          "game-data",
          true,
        );
      }

      const model = this.#mapModel.model();
      if (
        !model ||
        this.#mapModel.state().status !== "ready" ||
        model.blockingInvalidTransitionCount !== 0
      ) {
        throw new Slice62Failure(
          "LIVE_TEST_MAP_MODEL_UNAVAILABLE",
          "The verified map/geometry model is not ready for route planning.",
          "map-model",
          true,
        );
      }
      steps.push(Object.freeze({
        name: "navigation-model",
        outcome: "passed",
        message: "The verified live map/geometry model is ready for planning.",
        evidence: Object.freeze({
          version: model.version,
          mapCount: model.mapCount,
          transitionCount: model.transitionCount,
          collisionLineCount: model.collisionLineCount,
          blockingInvalidTransitionCount: model.blockingInvalidTransitionCount,
          ignoredInvalidTransitionCount: model.ignoredInvalidTransitionCount,
        }),
      }));

      const probe = findReachableProbe(model.maps, (from, to) =>
        this.#planner.plan(from, to)
      );
      if (!probe) {
        throw new Slice62Failure(
          "LIVE_TEST_NO_REACHABLE_PROBE_ROUTE",
          "No collision-safe unconditional cross-map probe route could be planned from the current live map model.",
          "reachable-route",
        );
      }
      const route = probe.route;
      if (
        route.status !== "reachable" ||
        route.diagnostics.mapHops < 1 ||
        !route.legs.some((leg) => leg.kind === "walk") ||
        !route.legs.some((leg) => leg.kind === "transition")
      ) {
        throw new Slice62Failure(
          "LIVE_TEST_ROUTE_STRUCTURE_INVALID",
          "The probe did not produce the expected reachable walk-plus-transition route.",
          "reachable-route",
        );
      }
      steps.push(Object.freeze({
        name: "reachable-route",
        outcome: "passed",
        message: "A structurally reachable cross-map route was found from live Adventure Land data.",
        evidence: Object.freeze({
          sourceMap: probe.sourceMap.key,
          sourceSpawnIndex: probe.sourceSpawnIndex,
          targetMap: probe.transition.target.map,
          targetSpawnIndex: probe.transition.target.spawnIndex,
          selectedTransitionId: probe.transition.id,
          status: route.status,
          mapHops: route.diagnostics.mapHops,
          legCount: route.legs.length,
        }),
      }));

      if (route.waypoints.length < 3) {
        throw new Slice62Failure(
          "LIVE_TEST_WAYPOINTS_MISSING",
          "The planned route did not expose enough explicit waypoints.",
          "waypoints",
        );
      }
      steps.push(Object.freeze({
        name: "waypoints",
        outcome: "passed",
        message: "The planned route exposes ordered map-aware waypoints.",
        evidence: Object.freeze({
          waypointCount: route.waypoints.length,
          waypoints: route.waypoints,
        }),
      }));

      let validatedWalkLegs = 0;
      let validatedTransitionLegs = 0;
      for (const leg of route.legs) {
        if (leg.kind === "walk") {
          const map = model.maps[leg.from.map];
          if (
            !map ||
            leg.from.map !== leg.to.map ||
            !canTraverseDirect(
              map.collision,
              leg.from.x,
              leg.from.y,
              leg.to.x,
              leg.to.y,
            )
          ) {
            throw new Slice62Failure(
              "LIVE_TEST_WALK_LEG_NOT_COLLISION_SAFE",
              "A planned walk leg failed independent collision validation.",
              "route-diagnostics",
            );
          }
          validatedWalkLegs += 1;
          continue;
        }

        const sourceMap = model.maps[leg.from.map];
        const transition = sourceMap?.transitions.find((entry) =>
          entry.id === leg.transitionId
        );
        if (
          !transition ||
          !transition.valid ||
          transition.metadata.length !== 0 ||
          transition.target.map !== leg.to.map ||
          transition.target.x !== leg.to.x ||
          transition.target.y !== leg.to.y
        ) {
          throw new Slice62Failure(
            "LIVE_TEST_TRANSITION_LEG_INVALID",
            "A planned transition leg did not resolve to the live target spawn.",
            "route-diagnostics",
          );
        }
        validatedTransitionLegs += 1;
      }

      if (
        validatedWalkLegs === 0 ||
        validatedTransitionLegs === 0 ||
        route.diagnostics.directChecks === 0 ||
        route.diagnostics.expandedNodes === 0
      ) {
        throw new Slice62Failure(
          "LIVE_TEST_ROUTE_DIAGNOSTICS_INCOMPLETE",
          "The route diagnostics did not prove both collision checks and graph search.",
          "route-diagnostics",
        );
      }
      steps.push(Object.freeze({
        name: "route-diagnostics",
        outcome: "passed",
        message: "Every route leg was independently validated and planner diagnostics are populated.",
        evidence: Object.freeze({
          validatedWalkLegs,
          validatedTransitionLegs,
          diagnostics: route.diagnostics,
        }),
      }));

      const characterAfter = this.#character.state();
      if (
        characterBefore.status === "connected" &&
        characterAfter.status !== "connected"
      ) {
        throw new Slice62Failure(
          "LIVE_TEST_CHARACTER_DISCONNECTED",
          "A Character that was already connected disconnected during the passive planner test.",
          "final-state",
        );
      }
      steps.push(Object.freeze({
        name: "final-state",
        outcome: "passed",
        message: "The planner test completed without executing movement or any gameplay mutation.",
        evidence: Object.freeze({
          characterRequired: false,
          characterStatusBefore: characterBefore.status,
          characterStatusAfter: characterAfter.status,
          movementExecution: false,
          gameplayMutation: false,
          rawSocketAccess: false,
        }),
      }));

      const result: Slice62LiveTestResult = Object.freeze({
        testId,
        slice: "6.2",
        outcome: "passed",
        startedAt,
        completedAt: this.#clock().toISOString(),
        message:
          "Slice 6.2 passed: a reachable route, ordered waypoints, and route diagnostics were verified against live Adventure Land navigation data.",
        steps: Object.freeze(steps),
        route,
      });
      this.#state = Object.freeze({
        status: "passed",
        message: result.message,
        lastResult: result,
      });
      this.#logger.info("Slice 6.2 simple path-planner test passed.", {
        testId,
        sourceMap: probe.sourceMap.key,
        targetMap: probe.transition.target.map,
        transitionId: probe.transition.id,
        waypointCount: route.waypoints.length,
        legCount: route.legs.length,
        mapHops: route.diagnostics.mapHops,
        directChecks: route.diagnostics.directChecks,
        expandedNodes: route.diagnostics.expandedNodes,
        totalWalkDistance: route.diagnostics.totalWalkDistance,
        characterRequired: false,
        movementExecution: false,
        gameplayMutation: false,
        rawSocketAccess: false,
      });
      return result;
    } catch (error) {
      const failure = error instanceof Slice62Failure
        ? error
        : new Slice62Failure(
          "UNEXPECTED_SLICE_6_2_FAILURE",
          error instanceof Error ? error.message : String(error),
          "unexpected",
        );
      const outcome: Slice62LiveTestOutcome = failure.blocked
        ? "blocked"
        : "failed";
      const result: Slice62LiveTestResult = Object.freeze({
        testId,
        slice: "6.2",
        outcome,
        startedAt,
        completedAt: this.#clock().toISOString(),
        message: failure.message,
        steps: Object.freeze(steps),
        error: Object.freeze({
          code: failure.code,
          step: failure.step,
          message: failure.message,
        }),
      });
      this.#state = Object.freeze({
        status: outcome,
        message: result.message,
        lastResult: result,
      });
      if (failure.blocked) {
        this.#logger.warn("Slice 6.2 simple path-planner test blocked.", {
          testId,
          code: failure.code,
          step: failure.step,
        });
      } else {
        this.#logger.error("Slice 6.2 simple path-planner test failed.", failure, {
          testId,
          code: failure.code,
          step: failure.step,
        });
      }
      return result;
    }
  }
}

class Slice62Failure extends Error {
  readonly code: string;
  readonly step: string;
  readonly blocked: boolean;

  constructor(code: string, message: string, step: string, blocked = false) {
    super(message);
    this.name = "Slice62Failure";
    this.code = code;
    this.step = step;
    this.blocked = blocked;
  }
}

function findReachableProbe(
  maps: Readonly<Record<string, AdventureLandNavigationMap>>,
  plan: (
    from: { map: string; x: number; y: number },
    to: { map: string; x: number; y: number },
  ) => PathPlanResult,
): Readonly<{
  sourceMap: AdventureLandNavigationMap;
  sourceSpawnIndex: number;
  transition: MapTransition;
  route: PathPlanResult;
}> | undefined {
  const orderedMaps = Object.values(maps)
    .filter((map) => !map.ignored)
    .sort((a, b) => {
      if (a.key === "main") return -1;
      if (b.key === "main") return 1;
      return a.key.localeCompare(b.key);
    });

  for (const sourceMap of orderedMaps) {
    const transitions = [...sourceMap.transitions].sort((a, b) =>
      a.index - b.index
    );
    for (const transition of transitions) {
      if (
        !transition.valid ||
        transition.metadata.length !== 0 ||
        transition.source.spawnIndex === undefined ||
        transition.target.x === undefined ||
        transition.target.y === undefined
      ) {
        continue;
      }
      const sourceSpawnIndex = transition.source.spawnIndex;
      const sourceSpawn = sourceMap.spawnPoints[sourceSpawnIndex];
      if (!sourceSpawn) continue;
      const route = plan(
        {
          map: sourceMap.key,
          x: sourceSpawn.x,
          y: sourceSpawn.y,
        },
        {
          map: transition.target.map,
          x: transition.target.x,
          y: transition.target.y,
        },
      );
      if (
        route.status === "reachable" &&
        route.legs.some((leg) =>
          leg.kind === "transition" &&
          leg.transitionId === transition.id
        ) &&
        route.legs.some((leg) => leg.kind === "walk")
      ) {
        return Object.freeze({
          sourceMap,
          sourceSpawnIndex,
          transition,
          route,
        });
      }
    }
  }
  return undefined;
}
