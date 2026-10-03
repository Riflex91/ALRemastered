import { createReadStream, existsSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AdventureLandAccountService } from "../account/service.ts";
import type { ActionGateway, ActionGatewayResult } from "../action/gateway.ts";
import type {
  AdventureLandMovementService,
  MovementDirection,
  MovementMode,
} from "../action/movement.ts";
import type { AdventureLandAttackService } from "../action/attack.ts";
import type { AdventureLandSkillService } from "../action/skill.ts";
import type { AdventureLandLootConsumableService } from "../action/loot-consumable.ts";
import type { AdventureLandSelectionService } from "../account/selection-service.ts";
import type { AdventureLandCharacterService } from "../character/service.ts";
import type { CoreRuntime, HealthSnapshot } from "../core/app.ts";
import type { DiagnosticsService } from "../diagnostics/service.ts";
import type { AdventureLandGameDataService } from "../game/data-service.ts";
import type { AdventureLandVersionService } from "../game/version-service.ts";
import type { Logger, LogRecord } from "../logging/logger.ts";
import type { Slice35LiveTestService } from "../live-test/slice-3-5.ts";
import type { Slice41LiveTestService } from "../live-test/slice-4-1.ts";
import type { Slice42LiveTestService } from "../live-test/slice-4-2.ts";
import type { Slice43LiveTestService } from "../live-test/slice-4-3.ts";
import type { ScriptRuntimeService } from "../script/runtime.ts";
import type { UpdateService } from "../update/service.ts";

export interface DashboardServerOptions {
  readonly logger: Logger;
  readonly runtime: CoreRuntime;
  readonly host?: string;
  readonly port?: number;
  readonly accountService?: AdventureLandAccountService;
  readonly selectionService?: AdventureLandSelectionService;
  readonly characterService?: AdventureLandCharacterService;
  readonly actionGateway?: ActionGateway;
  readonly movementService?: AdventureLandMovementService;
  readonly attackService?: AdventureLandAttackService;
  readonly skillService?: AdventureLandSkillService;
  readonly lootConsumableService?: AdventureLandLootConsumableService;
  readonly slice35LiveTestService?: Slice35LiveTestService;
  readonly scriptRuntime?: ScriptRuntimeService;
  readonly slice41LiveTestService?: Slice41LiveTestService;
  readonly slice42LiveTestService?: Slice42LiveTestService;
  readonly slice43LiveTestService?: Slice43LiveTestService;
  readonly updateService?: UpdateService;
  readonly diagnostics?: DiagnosticsService;
  readonly gameVersionService?: AdventureLandVersionService;
  readonly gameDataService?: AdventureLandGameDataService;
}

export class DashboardServer {
  readonly #logger: Logger;
  readonly #runtime: CoreRuntime;
  readonly #host: string;
  readonly #port: number;
  readonly #accountService?: AdventureLandAccountService;
  readonly #selectionService?: AdventureLandSelectionService;
  readonly #characterService?: AdventureLandCharacterService;
  readonly #actionGateway?: ActionGateway;
  readonly #movementService?: AdventureLandMovementService;
  readonly #attackService?: AdventureLandAttackService;
  readonly #skillService?: AdventureLandSkillService;
  readonly #lootConsumableService?: AdventureLandLootConsumableService;
  readonly #slice35LiveTestService?: Slice35LiveTestService;
  readonly #scriptRuntime?: ScriptRuntimeService;
  readonly #slice41LiveTestService?: Slice41LiveTestService;
  readonly #slice42LiveTestService?: Slice42LiveTestService;
  readonly #slice43LiveTestService?: Slice43LiveTestService;
  readonly #updateService?: UpdateService;
  readonly #diagnostics?: DiagnosticsService;
  readonly #gameVersionService?: AdventureLandVersionService;
  readonly #gameDataService?: AdventureLandGameDataService;
  #server?: Server;
  #url?: string;
  readonly #clients = new Set<ServerResponse>();
  #unsubscribe?: () => void;

  constructor(options: DashboardServerOptions) {
    this.#logger = options.logger;
    this.#runtime = options.runtime;
    this.#host = options.host ?? "127.0.0.1";
    this.#port = options.port ?? 3210;
    this.#accountService = options.accountService;
    this.#selectionService = options.selectionService;
    this.#characterService = options.characterService;
    this.#actionGateway = options.actionGateway;
    this.#movementService = options.movementService;
    this.#attackService = options.attackService;
    this.#skillService = options.skillService;
    this.#lootConsumableService = options.lootConsumableService;
    this.#slice35LiveTestService = options.slice35LiveTestService;
    this.#scriptRuntime = options.scriptRuntime;
    this.#slice41LiveTestService = options.slice41LiveTestService;
    this.#slice42LiveTestService = options.slice42LiveTestService;
    this.#slice43LiveTestService = options.slice43LiveTestService;
    this.#updateService = options.updateService;
    this.#diagnostics = options.diagnostics;
    this.#gameVersionService = options.gameVersionService;
    this.#gameDataService = options.gameDataService;
  }

  get url(): string {
    if (!this.#url) throw new Error("Dashboard server has not started.");
    return this.#url;
  }

  async start(): Promise<string> {
    if (this.#server) return this.url;

    const server = createServer((request, response) => {
      void this.#handleRequest(request, response).catch((error) => {
        this.#logger.error("Dashboard request failed.", error, {
          method: request.method,
          path: request.url,
        });
        if (!response.headersSent) {
          response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        }
        if (!response.writableEnded) response.end(JSON.stringify({ error: "Dashboard request failed." }));
      });
    });
    this.#server = server;
    this.#unsubscribe = this.#logger.subscribe((record) => this.#broadcast(record));

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.#port, this.#host, () => {
        server.off("error", reject);
        resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard server did not expose a TCP address.");
    this.#url = `http://${this.#host}:${address.port}`;
    this.#logger.info("Dashboard server started.", { url: this.#url });
    return this.#url;
  }

  async stop(): Promise<void> {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    for (const client of this.#clients) client.end();
    this.#clients.clear();

    const server = this.#server;
    this.#server = undefined;
    this.#url = undefined;
    if (!server) return;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }

  async #handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const pathWithQuery = request.url ?? "/";
    const method = request.method ?? "GET";
    const path = pathWithQuery.split("?", 1)[0];

    if (method === "GET" && path === "/api/account") {
      if (!this.#accountService) return this.#json(response, { status: "unavailable" }, 503);
      return this.#json(response, this.#accountService.state());
    }
    if (method === "POST" && path === "/api/account/login") {
      if (!this.#accountService) return this.#json(response, { error: "Account service is unavailable." }, 503);
      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body.";
        return this.#json(response, { error: message }, 400);
      }
      const email = typeof body.email === "string" ? body.email : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!email.trim() || !password) {
        return this.#json(response, { error: "Email and password are required." }, 400);
      }
      const accountState = await this.#accountService.login({ email, password });
      if (accountState.status === "connected" && this.#selectionService) {
        await this.#selectionService.refresh();
      }
      return this.#json(response, accountState);
    }
    if (method === "POST" && path === "/api/account/disconnect") {
      if (!this.#accountService) return this.#json(response, { error: "Account service is unavailable." }, 503);
      if (this.#characterService) await this.#characterService.stop("account_disconnect");
      const accountState = this.#accountService.disconnect();
      this.#selectionService?.clear();
      return this.#json(response, accountState);
    }

    if (method === "GET" && path === "/api/selection") {
      if (!this.#selectionService) return this.#json(response, { status: "unavailable" }, 503);
      return this.#json(response, this.#selectionService.state());
    }
    if (method === "POST" && path === "/api/selection/refresh") {
      if (!this.#selectionService) return this.#json(response, { error: "Character and server service is unavailable." }, 503);
      return this.#runSelectionAction(response, () => this.#selectionService!.refresh());
    }
    if (method === "POST" && path === "/api/selection/server") {
      if (!this.#selectionService) return this.#json(response, { error: "Character and server service is unavailable." }, 503);
      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body.";
        return this.#json(response, { error: message }, 400);
      }
      const serverKey = typeof body.serverKey === "string" ? body.serverKey : "";
      if (!serverKey.trim()) return this.#json(response, { error: "Server selection is required." }, 400);
      return this.#runSelectionAction(
        response,
        () => this.#selectionService!.selectServer(serverKey),
      );
    }

    if (method === "GET" && path === "/api/character") {
      if (!this.#characterService) return this.#json(response, { status: "unavailable" }, 503);
      return this.#json(response, this.#characterService.state());
    }
    if (method === "POST" && path === "/api/character/start") {
      if (!this.#characterService) return this.#json(response, { error: "Character connection service is unavailable." }, 503);
      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body.";
        return this.#json(response, { error: message }, 400);
      }
      const characterId = typeof body.characterId === "string" ? body.characterId : "";
      if (!characterId.trim()) return this.#json(response, { error: "Character selection is required." }, 400);
      return this.#runCharacterAction(
        response,
        () => this.#characterService!.start(characterId),
      );
    }
    if (method === "POST" && path === "/api/character/stop") {
      if (!this.#characterService) return this.#json(response, { error: "Character connection service is unavailable." }, 503);
      return this.#runCharacterAction(
        response,
        () => this.#characterService!.stop("dashboard"),
      );
    }

    if (method === "GET" && path === "/api/action-gateway") {
      if (!this.#actionGateway) {
        return this.#json(response, { status: "unavailable" }, 503);
      }
      return this.#json(response, this.#actionGateway.state());
    }
    if (method === "POST" && path === "/api/action-gateway/probe") {
      if (!this.#actionGateway) {
        return this.#json(response, { error: "Action gateway is unavailable." }, 503);
      }
      const characterId = this.#characterService?.state().characterId;
      const result = await this.#actionGateway.run({
        action: "gateway.probe",
        origin: "dashboard",
        characterId,
        input: { kind: "local-probe" },
        timeoutMs: 1_000,
        minIntervalMs: 1_000,
        execute: () => ({
          ok: true,
          message: "Local action gateway probe completed.",
        }),
      });
      return this.#json(
        response,
        result,
        gatewayStatusCode(result),
      );
    }

    if (method === "POST" && path === "/api/action-gateway/movement-test") {
      if (!this.#movementService) {
        return this.#json(response, { error: "Movement test service is unavailable." }, 503);
      }

      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body.";
        return this.#json(response, { error: message }, 400);
      }

      const mode = parseMovementMode(body.mode);
      const direction = parseMovementDirection(body.direction);
      if (!mode || !direction) {
        return this.#json(
          response,
          {
            error:
              "Movement test requires mode move/xmove and direction left/right/up/down.",
          },
          400,
        );
      }

      const result = await this.#movementService.runDashboardTest({
        mode,
        direction,
      });
      return this.#json(response, result, gatewayStatusCode(result));
    }

    if (method === "POST" && path === "/api/action-gateway/attack-test") {
      if (!this.#attackService) {
        return this.#json(response, { error: "Attack test service is unavailable." }, 503);
      }

      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body.";
        return this.#json(response, { error: message }, 400);
      }

      if (typeof body.targetId !== "string" || !body.targetId.trim()) {
        return this.#json(
          response,
          { error: "Attack test requires one visible monster target ID." },
          400,
        );
      }

      const result = await this.#attackService.runDashboardTest({
        targetId: body.targetId,
      });
      return this.#json(response, result, gatewayStatusCode(result));
    }

    if (method === "GET" && path === "/api/action-gateway/skill-options") {
      if (!this.#skillService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Skill test service is unavailable.",
          skills: [],
        }, 503);
      }
      return this.#json(response, this.#skillService.dashboardOptions());
    }

    if (method === "POST" && path === "/api/action-gateway/skill-test") {
      if (!this.#skillService) {
        return this.#json(response, { error: "Skill test service is unavailable." }, 503);
      }

      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body.";
        return this.#json(response, { error: message }, 400);
      }

      if (typeof body.skillName !== "string" || !body.skillName.trim()) {
        return this.#json(
          response,
          { error: "Skill test requires one supported skill name." },
          400,
        );
      }
      if (
        body.targetId !== undefined &&
        body.targetId !== null &&
        typeof body.targetId !== "string"
      ) {
        return this.#json(
          response,
          { error: "Skill target ID must be a string when provided." },
          400,
        );
      }

      const result = await this.#skillService.runDashboardTest({
        skillName: body.skillName,
        targetId: typeof body.targetId === "string"
          ? body.targetId
          : undefined,
      });
      return this.#json(response, result, gatewayStatusCode(result));
    }

    if (method === "GET" && path === "/api/action-gateway/loot-consumable-options") {
      if (!this.#lootConsumableService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Loot and consumable test service is unavailable.",
          lootChests: [],
          consumables: [],
        }, 503);
      }
      return this.#json(response, this.#lootConsumableService.dashboardOptions());
    }

    if (method === "POST" && path === "/api/action-gateway/loot-test") {
      if (!this.#lootConsumableService) {
        return this.#json(response, { error: "Loot test service is unavailable." }, 503);
      }

      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body.";
        return this.#json(response, { error: message }, 400);
      }
      if (typeof body.chestId !== "string" || !body.chestId.trim()) {
        return this.#json(
          response,
          { error: "Loot test requires one visible loot chest ID." },
          400,
        );
      }

      const result = await this.#lootConsumableService.runDashboardLoot({
        chestId: body.chestId,
      });
      return this.#json(response, result, gatewayStatusCode(result));
    }

    if (method === "POST" && path === "/api/action-gateway/consumable-test") {
      if (!this.#lootConsumableService) {
        return this.#json(response, { error: "Consumable test service is unavailable." }, 503);
      }

      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body.";
        return this.#json(response, { error: message }, 400);
      }
      if (
        typeof body.inventoryIndex !== "number" ||
        !Number.isInteger(body.inventoryIndex) ||
        body.inventoryIndex < 0 ||
        typeof body.itemName !== "string" ||
        !body.itemName.trim() ||
        (body.kind !== "hp" && body.kind !== "mp")
      ) {
        return this.#json(
          response,
          { error: "Consumable test requires one validated HP/MP inventory item." },
          400,
        );
      }

      const result = await this.#lootConsumableService.runDashboardConsumable({
        inventoryIndex: body.inventoryIndex,
        itemName: body.itemName,
        kind: body.kind,
      });
      return this.#json(response, result, gatewayStatusCode(result));
    }

    if (method === "GET" && path === "/api/live-test/slice-3-5") {
      if (!this.#slice35LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 3.5 one-click live-test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice35LiveTestService.state());
    }

    if (method === "POST" && path === "/api/live-test/slice-3-5/start") {
      if (!this.#slice35LiveTestService) {
        return this.#json(response, {
          error: "Slice 3.5 one-click live-test service is unavailable.",
        }, 503);
      }
      const result = await this.#slice35LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 3.5 one-click live test",
        result,
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }

    if (method === "GET" && path === "/api/script-runtime") {
      if (!this.#scriptRuntime) {
        return this.#json(response, { status: "unavailable", message: "Script runtime is unavailable." }, 503);
      }
      return this.#json(response, this.#scriptRuntime.state());
    }

    if (method === "POST" && path === "/api/script-runtime/load") {
      if (!this.#scriptRuntime) {
        return this.#json(response, { error: "Script runtime is unavailable." }, 503);
      }
      let body: Record<string, unknown>;
      try {
        body = await this.#readJsonObject(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body.";
        return this.#json(response, { error: message }, 400);
      }
      if (typeof body.name !== "string" || typeof body.source !== "string") {
        return this.#json(response, { error: "Script name and source are required." }, 400);
      }
      try {
        return this.#json(response, await this.#scriptRuntime.load({
          name: body.name,
          source: body.source,
        }));
      } catch (error) {
        return this.#json(response, {
          error: error instanceof Error ? error.message : "Script could not be loaded.",
        }, 400);
      }
    }

    if (method === "POST" && path === "/api/script-runtime/start") {
      if (!this.#scriptRuntime) return this.#json(response, { error: "Script runtime is unavailable." }, 503);
      try {
        return this.#json(response, await this.#scriptRuntime.start());
      } catch (error) {
        return this.#json(response, {
          error: error instanceof Error ? error.message : "Script could not be started.",
        }, 400);
      }
    }

    if (method === "POST" && path === "/api/script-runtime/pause") {
      if (!this.#scriptRuntime) return this.#json(response, { error: "Script runtime is unavailable." }, 503);
      return this.#json(response, await this.#scriptRuntime.pause());
    }

    if (method === "POST" && path === "/api/script-runtime/stop") {
      if (!this.#scriptRuntime) return this.#json(response, { error: "Script runtime is unavailable." }, 503);
      return this.#json(response, await this.#scriptRuntime.stop());
    }

    if (method === "GET" && path === "/api/live-test/slice-4-1") {
      if (!this.#slice41LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 4.1 one-click live-test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice41LiveTestService.state());
    }

    if (method === "POST" && path === "/api/live-test/slice-4-1/start") {
      if (!this.#slice41LiveTestService) {
        return this.#json(response, {
          error: "Slice 4.1 one-click live-test service is unavailable.",
        }, 503);
      }
      const result = await this.#slice41LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 4.1 one-click live test",
        result,
        scriptRuntime: this.#scriptRuntime?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }

    if (method === "GET" && path === "/api/live-test/slice-4-2") {
      if (!this.#slice42LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 4.2 one-click live-test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice42LiveTestService.state());
    }

    if (method === "POST" && path === "/api/live-test/slice-4-2/start") {
      if (!this.#slice42LiveTestService) {
        return this.#json(response, {
          error: "Slice 4.2 one-click live-test service is unavailable.",
        }, 503);
      }
      const result = await this.#slice42LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 4.2 one-click live test",
        result,
        scriptRuntime: this.#scriptRuntime?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }

    if (method === "GET" && path === "/api/live-test/slice-4-3") {
      if (!this.#slice43LiveTestService) {
        return this.#json(response, {
          status: "unavailable",
          message: "Slice 4.3 one-click live-test service is unavailable.",
        }, 503);
      }
      return this.#json(response, this.#slice43LiveTestService.state());
    }

    if (method === "POST" && path === "/api/live-test/slice-4-3/start") {
      if (!this.#slice43LiveTestService) {
        return this.#json(response, {
          error: "Slice 4.3 one-click live-test service is unavailable.",
        }, 503);
      }
      const result = await this.#slice43LiveTestService.run();
      const diagnostic = this.#exportPayload();
      const report = {
        schemaVersion: 1,
        kind: "ALRemastered Slice 4.3 one-click live test",
        result,
        scriptRuntime: this.#scriptRuntime?.state(),
        diagnostic,
      };
      return this.#json(response, {
        result,
        reportText: JSON.stringify(report, null, 2),
        clipboardSuggested: true,
      });
    }

    if (method === "GET" && path === "/api/diagnostics/snapshot") {
      if (!this.#diagnostics) return this.#json(response, { error: "Diagnostics service is unavailable." }, 503);
      return this.#json(response, this.#diagnostics.snapshot());
    }
    if (method === "GET" && path === "/api/diagnostics/package") {
      if (!this.#diagnostics) return this.#json(response, { error: "Diagnostics service is unavailable." }, 503);
      const diagnosticPackage = this.#diagnostics.package();
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${diagnosticPackage.fileName}"`,
        "Cache-Control": "no-store",
      });
      response.end(diagnosticPackage.content);
      return;
    }

    if (method === "GET" && path === "/api/status") {
      return this.#json(response, this.#runtime.health());
    }
    if (method === "GET" && path === "/api/game-data") {
      if (!this.#gameDataService) return this.#json(response, { status: "unavailable" }, 503);
      return this.#json(response, this.#gameDataService.state());
    }
    if (method === "POST" && path === "/api/game-data/reload") {
      if (!this.#gameDataService) return this.#json(response, { error: "Game data service is unavailable." }, 503);
      return this.#runGameDataAction(response, () => this.#gameDataService!.loadNow(true));
    }

    if (method === "GET" && path === "/api/game-version") {
      if (!this.#gameVersionService) return this.#json(response, { status: "unavailable" }, 503);
      return this.#json(response, this.#gameVersionService.state());
    }
    if (method === "POST" && path === "/api/game-version/check") {
      if (!this.#gameVersionService) return this.#json(response, { error: "Game version service is unavailable." }, 503);
      return this.#runGameVersionAction(response, () => this.#gameVersionService!.checkNow(true));
    }

    if (method === "GET" && path === "/api/update") {
      if (!this.#updateService) return this.#json(response, { status: "unavailable" }, 503);
      return this.#json(response, this.#updateService.state());
    }
    if (method === "POST" && path === "/api/update/check") {
      if (!this.#updateService) return this.#json(response, { error: "Update service is unavailable." }, 503);
      return this.#runUpdateAction(response, () => this.#updateService!.checkNow(true));
    }
    if (method === "POST" && path === "/api/update/skip") {
      if (!this.#updateService) return this.#json(response, { error: "Update service is unavailable." }, 503);
      return this.#runUpdateAction(response, () => this.#updateService!.skipVersion());
    }
    if (method === "POST" && path === "/api/update/remind") {
      if (!this.#updateService) return this.#json(response, { error: "Update service is unavailable." }, 503);
      return this.#runUpdateAction(response, () => this.#updateService!.remindTomorrow());
    }
    if (method === "POST" && path === "/api/update/install") {
      if (!this.#updateService) return this.#json(response, { error: "Update service is unavailable." }, 503);
      return this.#runUpdateAction(response, () => this.#updateService!.installUpdate());
    }

    if (method === "GET" && path === "/api/logs") {
      return this.#json(response, { records: this.#logger.records() });
    }
    if (method === "GET" && path === "/api/logs/export") {
      return this.#json(response, this.#exportPayload());
    }
    if (method === "POST" && path === "/api/logs/clear") {
      this.#logger.clearBuffer();
      this.#broadcastEvent("clear", { ok: true });
      return this.#json(response, { ok: true });
    }
    if (method === "GET" && path === "/api/logs/stream") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      response.write(": connected\n\n");
      for (const record of this.#logger.records()) {
        response.write(this.#event("log", record));
      }
      this.#clients.add(response);
      response.on("close", () => this.#clients.delete(response));
      return;
    }

    if (method !== "GET") {
      response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Method not allowed.");
      return;
    }

    const assets: Readonly<Record<string, string>> = {
      "/": "index.html",
      "/index.html": "index.html",
      "/styles.css": "styles.css",
      "/app.js": "app.js",
    };
    const assetName = assets[path];
    if (!assetName) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found.");
      return;
    }

    const assetUrl = new URL(`../../dashboard/${assetName}`, import.meta.url);
    const filePath = fileURLToPath(assetUrl);
    if (!existsSync(filePath)) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found.");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    createReadStream(filePath).pipe(response);
  }

  async #runSelectionAction(response: ServerResponse, action: () => unknown | Promise<unknown>): Promise<void> {
    try {
      this.#json(response, await action());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#json(response, { error: message }, 400);
    }
  }

  async #runCharacterAction(response: ServerResponse, action: () => unknown | Promise<unknown>): Promise<void> {
    try {
      this.#json(response, await action());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#json(response, { error: message }, 400);
    }
  }

  async #runGameDataAction(response: ServerResponse, action: () => unknown | Promise<unknown>): Promise<void> {
    try {
      this.#json(response, await action());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#json(response, { error: message }, 400);
    }
  }

  async #runGameVersionAction(response: ServerResponse, action: () => unknown | Promise<unknown>): Promise<void> {
    try {
      this.#json(response, await action());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#json(response, { error: message }, 400);
    }
  }

  async #runUpdateAction(response: ServerResponse, action: () => unknown | Promise<unknown>): Promise<void> {
    try {
      this.#json(response, await action());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#json(response, { error: message }, 400);
    }
  }

  async #readJsonObject(request: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > 16 * 1024) {
        throw new Error("Request body is too large.");
      }
      chunks.push(buffer);
    }

    if (bytes === 0) return {};

    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new Error("Request body must be valid JSON.");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Request body must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
  }

  #json(response: ServerResponse, payload: unknown, statusCode = 200): void {
    response.writeHead(statusCode, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(payload));
  }

  #broadcast(record: LogRecord): void {
    const event = this.#event("log", record);
    for (const client of this.#clients) client.write(event);
  }

  #broadcastEvent(name: string, payload: unknown): void {
    const event = this.#event(name, payload);
    for (const client of this.#clients) client.write(event);
  }

  #event(name: string, payload: unknown): string {
    return `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
  }

  #exportPayload(): {
    readonly text: string;
    readonly lineCount: number;
    readonly from: string;
    readonly to: string;
    readonly sanitized: true;
  } {
    const records = this.#logger.records();
    const health: HealthSnapshot = this.#runtime.health();
    const from = records.at(0)?.timestamp ?? "n/a";
    const to = records.at(-1)?.timestamp ?? "n/a";
    const header = [
      "ALRemastered Diagnostic Log",
      `Client version: ${health.version}`,
      `Platform: ${health.platform}`,
      `Log lines: ${records.length}`,
      `Time range: ${from} -> ${to}`,
      "Secrets sanitized: yes",
      "",
    ].join("\n");

    return {
      text: `${header}${records.map((record) => JSON.stringify(record)).join("\n")}`,
      lineCount: records.length,
      from,
      to,
      sanitized: true,
    };
  }
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".html": return "text/html; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    default: return "application/octet-stream";
  }
}


function gatewayStatusCode(result: ActionGatewayResult): number {
  switch (result.outcome) {
    case "success": return 200;
    case "rate_limited": return 429;
    case "timeout": return 504;
    case "error": return 400;
  }
}

function parseMovementMode(value: unknown): MovementMode | undefined {
  return value === "move" || value === "xmove" ? value : undefined;
}

function parseMovementDirection(
  value: unknown,
): MovementDirection | undefined {
  return value === "left" ||
      value === "right" ||
      value === "up" ||
      value === "down"
    ? value
    : undefined;
}
