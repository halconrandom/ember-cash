// El service worker corre de verdad: atiende fetches contra un servidor local
// y la caché en memoria no se queda con /api, auth ni datos financieros.
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type Stored = { status: number; body: string };

type Sandbox = {
  origin: string;
  urls: () => string[];
  install: () => Promise<void>;
  handle: (request: Request) => Promise<Response | null>;
};

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") resolve(address.port);
    });
  });
}

/** Caché y ámbito mínimos para ejecutar public/sw.js. */
function loadWorker(origin: string): Sandbox {
  const boxes = new Map<string, Map<string, Stored>>();
  const listeners: Record<string, Array<(event: unknown) => void>> = {
    install: [],
    activate: [],
    fetch: [],
  };

  const cacheFor = (name: string) => {
    let box = boxes.get(name);
    if (!box) {
      box = new Map();
      boxes.set(name, box);
    }
    return box;
  };

  const toUrl = (request: Request | string) =>
    typeof request === "string" ? new URL(request, origin).href : request.url;

  const caches = {
    async open(name: string) {
      const box = cacheFor(name);
      return {
        async addAll(paths: string[]) {
          await Promise.all(
            paths.map(async (path) => {
              const url = new URL(path, origin).href;
              const response = await fetch(url);
              if (!response.ok) throw new Error(`precarga ${url}`);
              box.set(url, {
                status: response.status,
                body: await response.text(),
              });
            }),
          );
        },
        async put(request: Request, response: Response) {
          box.set(request.url, {
            status: response.status,
            body: await response.text(),
          });
        },
        async match(request: Request | string) {
          const hit = box.get(toUrl(request));
          return hit ? new Response(hit.body, { status: hit.status }) : undefined;
        },
      };
    },
    async match(request: Request | string) {
      const url = toUrl(request);
      for (const box of boxes.values()) {
        const hit = box.get(url);
        if (hit) return new Response(hit.body, { status: hit.status });
      }
      return undefined;
    },
    async keys() {
      return [...boxes.keys()];
    },
    async delete(name: string) {
      return boxes.delete(name);
    },
  };

  const self = {
    location: { origin },
    addEventListener(type: string, fn: (event: unknown) => void) {
      listeners[type].push(fn);
    },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };

  const context = createContext({ self, caches, fetch, URL, Request, Response, Headers, console });
  runInContext(readFileSync("public/sw.js", "utf8"), context);

  return {
    origin,
    urls: () => [...boxes.values()].flatMap((box) => [...box.keys()]),
    async install() {
      const waits: Array<Promise<unknown>> = [];
      for (const fn of listeners.install) fn({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
      await Promise.all(waits);
    },
    async handle(request: Request) {
      let responded: Promise<Response> | null = null;
      const event = {
        request,
        respondWith(value: Promise<Response>) {
          responded = value;
        },
        waitUntil() {
          return undefined;
        },
      };
      for (const fn of listeners.fetch) fn(event);
      return responded;
    },
  };
}

describe("service worker con fetches reales", () => {
  let server: Server;
  let origin: string;
  let worker: Sandbox;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const path = req.url?.split("?")[0] ?? "/";
      if (path === "/dashboard") {
        req.socket.destroy();
        return;
      }
      const body =
        path === "/api/health"
          ? '{"ok":true,"amount_minor":"1800000"}'
          : path === "/transactions"
            ? '{"owner":"otra-persona","amount_minor":"999999"}'
            : path === "/auth/callback"
              ? "auth"
              : path === "/offline.html"
                ? "offline-shell"
                : "estatico";
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(body);
    });
    const port = await listen(server);
    origin = `http://127.0.0.1:${port}`;
    worker = loadWorker(origin);
    await worker.install();
  });

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  );

  it("precarga el cascarón y no guarda la API, auth ni los datos", async () => {
    expect(worker.urls().some((url) => url.endsWith("/offline.html"))).toBe(true);

    const health = await fetch(`${origin}/api/health`);
    expect(await health.text()).toContain("1800000");
    expect(await worker.handle(new Request(`${origin}/api/health`))).toBeNull();

    const money = await fetch(`${origin}/transactions`, {
      headers: { cookie: "sb-access-token=sesion" },
    });
    expect(await money.text()).toContain("999999");
    expect(
      await worker.handle(
        new Request(`${origin}/transactions`, { headers: { cookie: "sb-access-token=sesion" } }),
      ),
    ).toBeNull();

    expect(await worker.handle(new Request(`${origin}/auth/callback`))).toBeNull();
    expect(await worker.handle(new Request(`${origin}/_next/static/app.js?_rsc=1`))).toBeNull();
    expect(
      await worker.handle(new Request(`${origin}/icons/icon-192.png`, { headers: { RSC: "1" } })),
    ).toBeNull();

    const cached = worker.urls().join(" ");
    expect(cached).not.toContain("/api/");
    expect(cached).not.toContain("/transactions");
    expect(cached).not.toContain("/auth/");
    expect(cached).not.toContain("1800000");
    expect(cached).not.toContain("999999");
  });

  it("sí guarda un estático pedido a la red y, sin red, la navegación cae en offline", async () => {
    const response = await worker.handle(new Request(`${origin}/_next/static/app.js`));
    expect(response).not.toBeNull();
    expect(await response?.text()).toBe("estatico");
    // sw.js guarda con caches.open().then(put) sin esperarlo: la respuesta
    // vuelve antes de que la copia entre en la caché.
    await vi.waitFor(() => {
      expect(worker.urls().some((url) => url.endsWith("/_next/static/app.js"))).toBe(true);
    });

    // undici no deja construir un Request con mode "navigate". La propiedad
    // propia tapa el getter para que el worker entre en esa rama.
    const navigation = new Request(`${origin}/dashboard`);
    Object.defineProperty(navigation, "mode", { value: "navigate" });
    const offline = await worker.handle(navigation);
    expect(await offline?.text()).toBe("offline-shell");
    expect(worker.urls().join(" ")).not.toContain("/dashboard");
  });
});
