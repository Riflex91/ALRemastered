import { randomUUID } from "node:crypto";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type { AdventureLandGameDataService } from "../game/data-service.ts";
import type { Logger } from "../logging/logger.ts";
import type {
  AdventureLandMapModelService,
  AdventureLandNavigationMap,
} from "../navigation/map-model.ts";

export type Slice61LiveTestOutcome = "passed" | "blocked" | "failed";

export interface Slice61LiveTestStep {
  readonly name: string;
  readonly outcome: "passed";
  readonly message: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface Slice61LiveTestResult {
  readonly testId: string;
  readonly slice: "6.1";
  readonly outcome: Slice61LiveTestOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly characterName?: string;
  readonly serverKey?: string;
  readonly message: string;
  readonly steps: readonly Slice61LiveTestStep[];
  readonly error?: Readonly<{
    code: string;
    step: string;
    message: string;
  }>;
}

export interface Slice61LiveTestState {
  readonly status: "idle" | "running" | Slice61LiveTestOutcome;
  readonly message: string;
  readonly lastResult?: Slice61LiveTestResult;
}

export interface Slice61LiveTestServiceOptions {
  readonly logger: Logger;
  readonly gameData: Pick<
    AdventureLandGameDataService,
    "state" | "data" | "loadNow"
  >;
  readonly mapModel: Pick<
    AdventureLandMapModelService,
    "state" | "model" | "map"
  >;
  readonly character: Pick<AdventureLandCharacterService, "state">;
  readonly clock?: () => Date;
  readonly idFactory?: () => string;
}

export class Slice61LiveTestService {
  readonly #logger: Logger;
  readonly #gameData: Slice61LiveTestServiceOptions["gameData"];
  readonly #mapModel: Slice61LiveTestServiceOptions["mapModel"];
  readonly #character: Slice61LiveTestServiceOptions["character"];
  readonly #clock: () => Date;
  readonly #idFactory: () => string;
  #running?: Promise<Slice61LiveTestResult>;
  #state: Slice61LiveTestState = Object.freeze({
    status: "idle",
    message: "Slice 6.1 map/geometry-model test is ready.",
  });

  constructor(options: Slice61LiveTestServiceOptions) {
    this.#logger = options.logger;
    this.#gameData = options.gameData;
    this.#mapModel = options.mapModel;
    this.#character = options.character;
    this.#clock = options.clock ?? (() => new Date());
    this.#idFactory = options.idFactory ?? (() => `live61-${randomUUID()}`);
  }

  state(): Slice61LiveTestState {
    return structuredClone(this.#state);
  }

  run(): Promise<Slice61LiveTestResult> {
    if (this.#running) return this.#running;
    this.#running = this.#runInternal().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #runInternal(): Promise<Slice61LiveTestResult> {
    const testId = this.#idFactory();
    const startedAt = this.#clock().toISOString();
    const steps: Slice61LiveTestStep[] = [];
    this.#state = Object.freeze({
      status: "running",
      message: "Slice 6.1 is validating the live Adventure Land map and collision model.",
    });
    this.#logger.info("Slice 6.1 map/geometry-model test started.", {
      testId,
      gameplayMutation: false,
      rawSocketAccess: false,
      pathfinding: false,
    });

    try {
      const character = this.#character.state();
      if (
        character.status !== "connected" ||
        !character.character?.map
      ) {
        throw new Slice61Failure(
          "LIVE_TEST_CHARACTER_NOT_CONNECTED",
          "Connect one headless character before running the Slice 6.1 map/geometry-model test.",
          "preflight",
          true,
        );
      }

      let data = this.#gameData.data();
      if (!data) {
        await this.#gameData.loadNow(true);
        data = this.#gameData.data();
      }
      if (!data || this.#gameData.state().status !== "loaded") {
        throw new Slice61Failure(
          "LIVE_TEST_GAME_DATA_UNAVAILABLE",
          "Adventure Land game data could not be loaded for the map/geometry-model test.",
          "game-data",
          true,
        );
      }

      const model = this.#mapModel.model();
      if (!model || this.#mapModel.state().status !== "ready") {
        throw new Slice61Failure(
          "LIVE_TEST_MAP_MODEL_UNAVAILABLE",
          "The canonical map/geometry model could not be built from loaded Adventure Land data.",
          "map-model",
        );
      }
      const expectedGeometryMaps = Object.keys(data.geometry)
        .filter((key) => Object.prototype.hasOwnProperty.call(data.maps, key))
        .length;
      if (
        model.version !== data.version ||
        model.mapCount !== Object.keys(data.maps).length ||
        model.geometryMapCount !== expectedGeometryMaps ||
        model.mapCount === 0
      ) {
        throw new Slice61Failure(
          "LIVE_TEST_MAP_MODEL_COUNT_MISMATCH",
          "The canonical map/geometry model does not match the loaded Adventure Land map families.",
          "map-model",
        );
      }
      steps.push(Object.freeze({
        name: "map-model",
        outcome: "passed",
        message: "All loaded Adventure Land maps were normalized into one versioned navigation model.",
        evidence: Object.freeze({
          version: model.version,
          mapCount: model.mapCount,
          geometryMapCount: model.geometryMapCount,
          mapsWithBounds: model.mapsWithBounds,
          missingGeometryMapCount: model.missingGeometryMapKeys.length,
          missingGeometryMapKeys: model.missingGeometryMapKeys,
        }),
      }));

      if (model.invalidTransitionCount !== 0) {
        throw new Slice61Failure(
          "LIVE_TEST_INVALID_TRANSITION_REFERENCES",
          `The live map model contains ${model.invalidTransitionCount} invalid door/transition reference(s).`,
          "transitions",
        );
      }
      const representative = selectRepresentativeMap(
        model.maps,
        character.character.map,
      );
      if (!representative) {
        throw new Slice61Failure(
          "LIVE_TEST_REPRESENTATIVE_MAP_UNAVAILABLE",
          "No live map contained bounds, collision lines, and a valid door transition for Slice 6.1 verification.",
          "representative-map",
        );
      }
      steps.push(Object.freeze({
        name: "map-bounds",
        outcome: "passed",
        message: "The representative live map exposes finite normalized map boundaries.",
        evidence: Object.freeze({
          map: representative.key,
          name: representative.name,
          currentCharacterMap: character.character.map,
          representsCurrentCharacterMap:
            representative.key === character.character.map,
          bounds: representative.bounds,
        }),
      }));

      if (representative.collision.lineCount <= 0) {
        throw new Slice61Failure(
          "LIVE_TEST_COLLISION_GEOMETRY_EMPTY",
          "The representative live map contains no collision-relevant geometry lines.",
          "collision-geometry",
        );
      }
      steps.push(Object.freeze({
        name: "collision-geometry",
        outcome: "passed",
        message: "Collision-relevant x/y line geometry is normalized and available for movement consumers.",
        evidence: Object.freeze({
          map: representative.key,
          xLineCount: representative.collision.xLines.length,
          yLineCount: representative.collision.yLines.length,
          lineCount: representative.collision.lineCount,
          totalCollisionLineCount: model.collisionLineCount,
        }),
      }));

      const transition = representative.transitions.find((entry) => entry.valid);
      if (
        !transition ||
        transition.target.x === undefined ||
        transition.target.y === undefined ||
        !model.maps[transition.target.map]
      ) {
        throw new Slice61Failure(
          "LIVE_TEST_TRANSITION_RESOLUTION_FAILED",
          "The representative live map did not expose a door with a resolved target map and target spawn.",
          "transitions",
        );
      }
      steps.push(Object.freeze({
        name: "transitions",
        outcome: "passed",
        message: "Door transitions resolve from source rectangles to existing target maps and target spawn coordinates.",
        evidence: Object.freeze({
          totalTransitionCount: model.transitionCount,
          invalidTransitionCount: model.invalidTransitionCount,
          sampleTransition: transition,
        }),
      }));

      const finalCharacter = this.#character.state();
      if (finalCharacter.status !== "connected") {
        throw new Slice61Failure(
          "LIVE_TEST_CHARACTER_DISCONNECTED",
          "The character disconnected while the passive map-model test was running.",
          "final-state",
        );
      }
      steps.push(Object.freeze({
        name: "final-state",
        outcome: "passed",
        message: "The passive model test completed without gameplay mutation or transport access.",
        evidence: Object.freeze({
          characterStatus: finalCharacter.status,
          characterMap: finalCharacter.character?.map,
          heartbeatSequence: finalCharacter.heartbeatSequence,
          pingMs: finalCharacter.pingMs,
          gameplayMutation: false,
          rawSocketAccess: false,
          pathfinding: false,
        }),
      }));

      const result: Slice61LiveTestResult = Object.freeze({
        testId,
        slice: "6.1",
        outcome: "passed",
        startedAt,
        completedAt: this.#clock().toISOString(),
        characterName: character.characterName,
        serverKey: character.serverKey,
        message: "Slice 6.1 passed: maps, boundaries, door transitions, and collision-relevant geometry were verified against live Adventure Land data.",
        steps: Object.freeze(steps),
      });
      this.#state = Object.freeze({
        status: "passed",
        message: result.message,
        lastResult: result,
      });
      this.#logger.info("Slice 6.1 map/geometry-model test passed.", {
        testId,
        gameDataVersion: model.version,
        mapCount: model.mapCount,
        geometryMapCount: model.geometryMapCount,
        mapsWithBounds: model.mapsWithBounds,
        transitionCount: model.transitionCount,
        collisionLineCount: model.collisionLineCount,
        representativeMap: representative.key,
        gameplayMutation: false,
        rawSocketAccess: false,
        pathfinding: false,
      });
      return result;
    } catch (error) {
      const failure = error instanceof Slice61Failure
        ? error
        : new Slice61Failure(
          "UNEXPECTED_SLICE_6_1_FAILURE",
          error instanceof Error ? error.message : String(error),
          "unexpected",
        );
      const outcome: Slice61LiveTestOutcome = failure.blocked ? "blocked" : "failed";
      const character = this.#character.state();
      const result: Slice61LiveTestResult = Object.freeze({
        testId,
        slice: "6.1",
        outcome,
        startedAt,
        completedAt: this.#clock().toISOString(),
        characterName: character.characterName,
        serverKey: character.serverKey,
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
        this.#logger.warn("Slice 6.1 map/geometry-model test blocked.", {
          testId,
          code: failure.code,
          step: failure.step,
        });
      } else {
        this.#logger.error("Slice 6.1 map/geometry-model test failed.", failure, {
          testId,
          code: failure.code,
          step: failure.step,
        });
      }
      return result;
    }
  }
}

class Slice61Failure extends Error {
  readonly code: string;
  readonly step: string;
  readonly blocked: boolean;

  constructor(code: string, message: string, step: string, blocked = false) {
    super(message);
    this.name = "Slice61Failure";
    this.code = code;
    this.step = step;
    this.blocked = blocked;
  }
}

function selectRepresentativeMap(
  maps: Readonly<Record<string, AdventureLandNavigationMap>>,
  currentMap: string,
): AdventureLandNavigationMap | undefined {
  const usable = (map: AdventureLandNavigationMap | undefined) =>
    Boolean(
      map?.bounds &&
      map.collision.lineCount > 0 &&
      map.transitions.some((transition) =>
        transition.valid &&
        transition.target.x !== undefined &&
        transition.target.y !== undefined
      ),
    );

  const current = maps[currentMap];
  if (usable(current)) return current;
  const main = maps.main;
  if (usable(main)) return main;
  return Object.values(maps).find((map) => usable(map));
}
