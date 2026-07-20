import { readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

export interface RegisteredFunction {
	kind: "query" | "mutation" | "action";
	path: string; // e.g. "queries/users/getUser"
	name: string; // e.g. "getUser"
	module: string; // absolute file path
	handler: unknown; // the QueryRegistration | MutationRegistration | ActionRegistration
}

const FUNCTION_DIRS = ["queries", "mutations", "actions"] as const;

/** Walk a directory recursively and return all .ts/.js file paths */
async function walk(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	const files: string[] = [];
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(full)));
		else if ([".ts", ".js"].includes(extname(entry.name))) files.push(full);
	}
	return files;
}

/** Scan functionsDir and return all registered functions */
export async function discoverFunctions(functionsDir: string): Promise<RegisteredFunction[]> {
	const registered: RegisteredFunction[] = [];

	for (const kind of FUNCTION_DIRS) {
		const dir = join(functionsDir, kind);
		const files = await walk(dir);

		for (const file of files) {
			const rel = relative(dir, file).replace(/\.(ts|js)$/, "");
			const mod = await import(file).catch(() => null);
			if (!mod) continue;

			for (const [exportName, exportValue] of Object.entries(mod)) {
				if (!exportValue || typeof exportValue !== "object") continue;
				const fn = exportValue as any;
				if (!fn._handler || !fn._args) continue;

				const fnKind: "query" | "mutation" | "action" =
					fn[Symbol.for("BetterBaseFunction")] ?? (kind.slice(0, -1) as any);

				const fnPath = `${kind}/${rel}/${exportName}`;
				fn.__betterbasePath = fnPath;

				registered.push({
					kind: fnKind,
					path: fnPath,
					name: exportName,
					module: file,
					handler: fn,
				});
			}
		}
	}

	return registered;
}

/** Singleton registry (populated once on server start or bb dev) */
let _registry: RegisteredFunction[] = [];

export function setFunctionRegistry(fns: RegisteredFunction[]) {
	_registry = fns;
}

export function getFunctionRegistry(): RegisteredFunction[] {
	return _registry;
}

export function lookupFunction(path: string): RegisteredFunction | null {
	return _registry.find((f) => f.path === path) ?? null;
}
