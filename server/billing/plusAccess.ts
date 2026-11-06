import type { Request } from "express";
import { supabaseAdmin } from "../supabaseServiceClient";
import { planFor } from "./entitlements";
import { decidePlusAccess, plusLive, type Caller, type PlusAccess } from "./plusRules";

export { plusLive, type PlusAccess };

/** Who may use a Swish+ feature on this request; the rule itself is in plusRules.ts. */
async function caller(req: Request): Promise<Caller> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(header.slice(7));
  if (error || !data.user) return null;
  return { id: data.user.id, role: (data.user.app_metadata?.role as string | undefined) ?? null };
}

export async function plusAccessFor(req: Request): Promise<PlusAccess> {
  const who = await caller(req);
  const live = plusLive();
  if (!who || who.role === "admin" || who.role === "coach" || !live) return decidePlusAccess(live, who, false);
  const plan = await planFor(who.id, who.role).catch(() => null);
  return decidePlusAccess(live, who, !!plan?.plus);
}
