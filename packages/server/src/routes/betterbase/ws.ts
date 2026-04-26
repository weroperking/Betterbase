import {
	inferTableDependencies,
	invalidationManager,
	lookupFunction,
	subscriptionTracker,
} from "@betterbase/core";
import { nanoid } from "nanoid";
import { verifyAdminToken } from "../../lib/auth";

const HEARTBEAT_INTERVAL_MS = 15_000; // ping every 15s
const HEARTBEAT_TIMEOUT_MS = 30_000; // disconnect after 30s without pong

interface ConnectedClient {
	id: string;
	ws: WebSocket; // Bun's native WebSocket
	projectSlug: string;
	lastPong: number;
	heartbeatTimer?: ReturnType<typeof setInterval>;
}

const clients = new Map<string, ConnectedClient>();

/** Bun WebSocket handler object — passed to Bun.serve() */
export const betterbaseWSHandler = {
	open(ws: any) {
		const clientId = nanoid();
		const projectSlug = ws.data?.projectSlug ?? "default";

		ws.__clientId = clientId;

		const client: ConnectedClient = {
			id: clientId,
			ws,
			projectSlug,
			lastPong: Date.now(),
		};

		// Heartbeat — ping every 15s, disconnect if no pong in 30s
		client.heartbeatTimer = setInterval(() => {
			const elapsed = Date.now() - client.lastPong;
			if (elapsed > HEARTBEAT_TIMEOUT_MS) {
				console.warn(`[ws] Client ${clientId} timed out — disconnecting`);
				ws.close(1001, "heartbeat timeout");
				return;
			}
			try {
				ws.send(JSON.stringify({ type: "ping" }));
			} catch {}
		}, HEARTBEAT_INTERVAL_MS);

		clients.set(clientId, client);

		// Wire invalidation push for this process
		invalidationManager.setPushFn((targetClientId: string, message: unknown) => {
			const c = clients.get(targetClientId);
			if (c) {
				try {
					c.ws.send(JSON.stringify(message));
				} catch {}
			}
		});

		ws.send(JSON.stringify({ type: "connected", clientId }));
	},

	message(ws: any, data: string | Buffer) {
		const clientId: string = ws.__clientId;
		const client = clients.get(clientId);
		if (!client) return;

		let msg: Record<string, unknown>;
		try {
			msg = JSON.parse(String(data));
		} catch {
			return;
		}

		switch (msg.type) {
			case "pong":
				client.lastPong = Date.now();
				break;

			case "subscribe": {
				if (typeof msg.path === "string") {
					let tables = Array.isArray(msg.tables) ? (msg.tables as string[]) : null;

					if (!tables) {
						// Infer tables from the registered function's handler
						const fn = lookupFunction(msg.path);
						if (fn) {
							tables = inferTableDependencies((fn.handler as any)._handler);
						} else {
							tables = ["*"];
						}
					}

					subscriptionTracker.subscribe(
						clientId,
						msg.path,
						(msg.args as Record<string, unknown>) ?? {},
						tables,
					);
					// Confirm subscription with resolved tables
					ws.send(JSON.stringify({ type: "subscribed", path: msg.path, tables }));
				}
				break;
			}

			case "unsubscribe":
				if (typeof msg.path === "string") {
					subscriptionTracker.unsubscribe(
						clientId,
						msg.path,
						(msg.args as Record<string, unknown>) ?? {},
					);
				}
				break;
		}
	},

	close(ws: any, code: number, reason: string) {
		const clientId: string = ws.__clientId;
		const client = clients.get(clientId);
		if (client?.heartbeatTimer) clearInterval(client.heartbeatTimer);
		clients.delete(clientId);
		subscriptionTracker.unsubscribeClient(clientId);
	},
};

/** For the admin dashboard stats endpoint */
export function getWSStats() {
	return {
		clients: clients.size,
		channels: [...new Set([...subscriptionTracker["_subs"].values()].map((s) => s.functionPath))],
	};
}

/** Mount in Bun.serve() options */
export function getBunServeConfig() {
	return {
		async fetch(req: Request, server: any) {
			const url = new URL(req.url);
			if (url.pathname === "/betterbase/ws") {
				const token = url.searchParams.get("token");
				const payload = token ? await verifyAdminToken(token) : null;
				if (!payload) return new Response("Unauthorized", { status: 401 });

				const projectSlug = url.searchParams.get("project") ?? "default";

				// Validate that the verified payload is authorized for the requested project
				// For admin tokens, we allow access to any project
				// Additional scope/role checks could be added here if needed

				// Scrub the token from URL searchParams before upgrade to prevent logging
				const scrubbedUrl = new URL(req.url);
				scrubbedUrl.searchParams.delete("token");
				const scrubbedReq = new Request(scrubbedUrl, req);

				const upgraded = server.upgrade(scrubbedReq, {
					data: { projectSlug, userId: payload.sub },
				});
				if (upgraded) return undefined;
				return new Response("WebSocket upgrade failed", { status: 400 });
			}
			return undefined;
		},
		websocket: betterbaseWSHandler,
	};
}
