import { createReadStream, existsSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CoreRuntime, HealthSnapshot } from "../core/app.ts";
import type { Logger, LogRecord } from "../logging/logger.ts";
import type { UpdateService } from "../update/service.ts";

export interface DashboardServerOptions {
  readonly logger: Logger;
  readonly runtime: CoreRuntime;
  readonly host?: string;
  readonly port?: number;
  readonly updateService?: UpdateService;
}

export class DashboardServer {
  readonly #logger: Logger;
  readonly #runtime: CoreRuntime;
  readonly #host: string;
  readonly #port: number;
  readonly #updateService?: UpdateService;
  #server?: Server;
  #url?: string;
  readonly #clients = new Set<ServerResponse>();
  #unsubscribe?: () => void;

  constructor(options: DashboardServerOptions) {
    this.#logger = options.logger;
    this.#runtime = options.runtime;
    this.#host = options.host ?? "127.0.0.1";
    this.#port = options.port ?? 3210;
    this.#updateService = options.updateService;
  }

  get url(): string {
    if (!this.#url) throw new Error("Dashboard server has not started.");
    return this.#url;
  }

  async start(): Promise<string> {
    if (this.#server) return this.url;

    const server = createServer((request, response) => {
      void this.#handleRequest(request.url ?? "/", request.method ?? "GET", response).catch((error) => {
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

  async #handleRequest(pathWithQuery: string, method: string, response: ServerResponse): Promise<void> {
    const path = pathWithQuery.split("?", 1)[0];

    if (method === "GET" && path === "/api/status") {
      return this.#json(response, this.#runtime.health());
    }
    if (method === "GET" && path === "/api/update") {
      if (!this.#updateService) return this.#json(response, { status: "unavailable" }, 503);
      return this.#json(response, this.#updateService.state());
    }
    if (method === "POST" && path === "/api/update/check") {
      if (!this.#updateService) return this.#json(response, { error: "Update service is unavailable." }, 503);
      return this.#json(response, await this.#updateService.checkNow(true));
    }
    if (method === "POST" && path === "/api/update/skip") {
      if (!this.#updateService) return this.#json(response, { error: "Update service is unavailable." }, 503);
      return this.#json(response, this.#updateService.skipVersion());
    }
    if (method === "POST" && path === "/api/update/remind") {
      if (!this.#updateService) return this.#json(response, { error: "Update service is unavailable." }, 503);
      return this.#json(response, this.#updateService.remindTomorrow());
    }
    if (method === "POST" && path === "/api/update/install") {
      if (!this.#updateService) return this.#json(response, { error: "Update service is unavailable." }, 503);
      return this.#json(response, await this.#updateService.installUpdate());
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
