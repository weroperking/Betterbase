import { join } from "path";
import { discoverFunctions, setFunctionRegistry } from "@betterbase/core/iac";
import { betterbaseRouter } from "@betterbase/server/routes/betterbase";
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();
app.use("*", cors());

// Discover and register betterbase/ functions on startup
const fns = await discoverFunctions(join(process.cwd(), "betterbase"));
setFunctionRegistry(fns);

// Mount the betterbase router — this is your entire API surface
app.route("/betterbase", betterbaseRouter);

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

export default { port: 3000, fetch: app.fetch };
