import { describe, expect, it } from "bun:test";
import { app } from "../../src/index";
import { RUN } from "./db";

describe.skipIf(!RUN)("health & readiness", () => {
	it("GET /health returns 200 (liveness)", async () => {
		const res = await app.request("/health");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ status: "ok" });
	});

	it("GET /ready returns 200 + ready when the DB is reachable", async () => {
		const res = await app.request("/ready");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ status: "ready" });
	});
});
