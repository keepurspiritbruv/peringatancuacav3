import { Hono } from "hono";
import { getBmkgData } from "../lib/bmkg-fetch";
import { ALLOWED_BEACH_LOCATIONS } from "../types";

const route = new Hono();

route.get("/bmkg/:beach", async (c) => {
	const beach = c.req.param("beach").toLowerCase();
	if (!ALLOWED_BEACH_LOCATIONS.includes(beach as (typeof ALLOWED_BEACH_LOCATIONS)[number])) {
		return c.json({ ok: false, error: `Unknown beach: ${beach}` }, 400);
	}

	const data = await getBmkgData(beach);
	return c.json({ ok: true, data });
});

route.get("/bmkg", async (c) => {
	const allData = await Promise.all(
		ALLOWED_BEACH_LOCATIONS.map(async (beach) => {
			const data = await getBmkgData(beach);
			return data;
		}),
	);
	return c.json({ ok: true, data: allData });
});

export default route;
