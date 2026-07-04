import type { BuiltinSensor } from "./types.js";
import { specValidate } from "./specValidate.js";
import { specTrace, fixtureHash, approvedTests } from "./builtins.js";
import { archBoundary } from "./archBoundary.js";
import { budget } from "./budget.js";

export * from "./types.js";
export { specValidate, checkEars } from "./specValidate.js";
export { specTrace, fixtureHash, approvedTests } from "./builtins.js";
export { archBoundary, checkArchBoundaries, loadLayerRules } from "./archBoundary.js";
export { budget } from "./budget.js";

export const builtinSensors: Record<string, BuiltinSensor> = {
  "spec-validate": specValidate,
  "spec-trace": specTrace,
  "fixture-hash": fixtureHash,
  "approved-tests": approvedTests,
  "arch-boundary": archBoundary,
  budget: budget
};

export function registerBuiltin(name: string, sensor: BuiltinSensor): void {
  builtinSensors[name] = sensor;
}
