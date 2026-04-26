import {
	inferTableDependencies,
	invalidationManager,
	lookupFunction,
	subscriptionTracker,
} from "@betterbase/core";
import { nanoid } from "nanoid";

const HEARTBEAT_INTERVAL_MS = 15_000; // ping every 15s
const HEARTBEAT_TIMEOUT_MS = 30_000; // disconnect after 30s without pong

interface ConnectedClient {
	id: string;
	ws: WebSocket; // Bun's native WebSocket
	projectSlug: string;
	lastPong: number;
	heartbeatTimer?: ReturnType<typeof setInterval>;
}
interface WSTicket {
	adminUserId: string;
	projectSlug: string;
	expiresAt: number;
}

const clients = new Map<string, ConnectedClient>();
const wsTickets = new Map<string, WSTicket>();
export const WS_TICKET_TTL_MS = 60_000;

function pruneExpiredWSTickets() {
	const now = Date.now();
	for (const [ticket, meta] of wsTickets.entries()) {
		if (meta.expiresAt <= now) wsTickets.delete(ticket);
	}
}

setInterval(pruneExpiredWSTickets, Math.max(15_000, Math.floor(WS_TICKET_TTL_MS / 2)));

export function createWSTicket(adminUserId: string, projectSlug: string): string {
	pruneExpiredWSTickets();
	const ticket = nanoid(32);
	wsTickets.set(ticket, { adminUserId, projectSlug, expiresAt: Date.now() + WS_TICKET_TTL_MS });
	return ticket;
}

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
				const ticket = url.searchParams.get("ticket");
				if (!ticket) return new Response("Unauthorized", { status: 401 });
				const wsTicket = wsTickets.get(ticket);
				if (!wsTicket || wsTicket.expiresAt < Date.now()) {
					wsTickets.delete(ticket);
					return new Response("Unauthorized", { status: 401 });
				}
				wsTickets.delete(ticket);

				const projectSlug = url.searchParams.get("project") ?? "default";
				if (projectSlug !== wsTicket.projectSlug) {
					return new Response("Forbidden", { status: 403 });
				}

				url.searchParams.delete("ticket");
				const sanitizedReq = new Request(url.toString(), {
					method: req.method,
					headers: req.headers,
				});
				const upgraded = server.upgrade(sanitizedReq, {
					data: { projectSlug, userId: wsTicket.adminUserId },
				});
				if (upgraded) return undefined;
				return new Response("WebSocket upgrade failed", { status: 400 });
			}
			return undefined;
		},
		websocket: betterbaseWSHandler,
	};
}
