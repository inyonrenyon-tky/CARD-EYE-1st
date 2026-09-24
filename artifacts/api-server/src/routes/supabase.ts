import { ReplitConnectors } from "@replit/connectors-sdk";
import { GetSupabaseStatusResponse } from "@workspace/api-zod";
import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/supabase/status", async (req, res) => {
  try {
    // This fixed, read-only request never exposes the connector's project key to clients.
    const response = await new ReplitConnectors().proxy("supabase", "/rest/v1/", {
      method: "GET",
    });
    // A misconfigured connector can return a dashboard HTML page with HTTP 200.
    // Only the PostgREST OpenAPI document proves that the project data API is reachable.
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("json")) {
      req.log.warn({ status: response.status }, "Supabase project API unavailable");
      res.status(503).json({ connected: false });
      return;
    }
    const schema: unknown = await response.json();
    if (!schema || typeof schema !== "object" || !("paths" in schema)) {
      req.log.warn("Supabase project API returned an unexpected response");
      res.status(503).json({ connected: false });
      return;
    }
    res.json(GetSupabaseStatusResponse.parse({ connected: true }));
  } catch {
    req.log.warn("Supabase connection check failed");
    res.status(503).json({ connected: false });
  }
});

export default router;