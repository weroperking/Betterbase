import { watch } from "fs";
import { existsSync } from "fs";
import { extname, join } from "path";
import path from "node:path";
import { info } from "../../utils/logger";

type WatchEvent = {
	path: string;
	relative: string;
	kind: "schema" | "function" | "module" | "server" | "config";
};

type Handler = (event: WatchEvent) => void | Promise<void>;

export class DevWatcher {
	private _handlers: Handler[] = [];
	private _debounce: Map<string, ReturnType<typeof setTimeout>> = new Map();
	private _debounceMs: number;
	private _watchers: ReturnType<typeof watch>[] = [];

	constructor(opts: { debounceMs?: number } = {}) {
		this._debounceMs = opts.debounceMs ?? 150;
	}

	/** Register a handler called on every debounced event */
	on(handler: Handler): this {
		this._handlers.push(handler);
		return this;
	}

	/** Start watching the given project root */
	start(projectRoot: string) {
		const dirs: { path: string; recursive: boolean }[] = [
			{ path: join(projectRoot, "betterbase"), recursive: true },
			{ path: join(projectRoot, "src"), recursive: true },
		];

		for (const { path: dirPath, recursive } of dirs) {
			if (!existsSync(dirPath)) continue;

			const w = watch(dirPath, { recursive }, (event, filename) => {
				if (!filename) return;
				const fullPath = join(dirPath, String(filename));
				const rel = path.relative(projectRoot, fullPath);

				if (rel.includes("_generated")) return; // never watch generated files
				if (rel.includes("node_modules")) return;
				if (![".ts", ".tsx", ".js", ".json"].includes(extname(fullPath))) return;

				const kind = this._classifyPath(rel);
				this._debounced(fullPath, () => {
					for (const h of this._handlers) h({ path: fullPath, relative: rel, kind });
				});
			});

			this._watchers.push(w);
		}

		info(
			`[dev] Watching ${dirs
				.filter((d) => existsSync(d.path))
				.map((d) => path.relative(projectRoot, d.path))
				.join(", ")}`,
		);
	}

	stop() {
		this._watchers.forEach((w) => w.close());
		this._watchers = [];
	}

	private _classifyPath(rel: string): WatchEvent["kind"] {
		if (rel.startsWith("betterbase/schema")) return "schema";
		if (
			rel.startsWith("betterbase/queries") ||
			rel.startsWith("betterbase/mutations") ||
			rel.startsWith("betterbase/actions") ||
			rel === "betterbase/cron.ts"
		)
			return "function";
		if (rel.startsWith("src/modules")) return "module";
		if (rel === "betterbase.config.ts") return "config";
		return "server";
	}

	private _debounced(key: string, fn: () => void) {
		clearTimeout(this._debounce.get(key));
		this._debounce.set(key, setTimeout(fn, this._debounceMs));
	}
}
