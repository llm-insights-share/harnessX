import type { Workspace } from "@harnessx/core/paths.js";
import type { SensorDef, SensorReport } from "@harnessx/core/schemas.js";

export interface SensorContext {
  ws: Workspace;
  change?: string;
  def: SensorDef;
  /** Changed files relative to repo root (relevance heuristics, NFR-001). */
  changedFiles?: string[];
}

export type BuiltinSensor = (ctx: SensorContext) => Promise<SensorReport> | SensorReport;
