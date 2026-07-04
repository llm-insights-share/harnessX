#!/usr/bin/env node
import { Command } from "commander";
import { registerFoundationCommands } from "./foundation.js";
import { registerGateCommands } from "./gates.js";
import { registerBehaviourCommands } from "./behaviour.js";
import { registerSteeringCommands } from "./steering.js";
import { registerAssetCommands } from "./assets.js";

export const program = new Command("hx")
  .description("HarnessX — outer harness for AI coding agents")
  .version("0.1.0");

registerFoundationCommands(program);
registerGateCommands(program);
registerBehaviourCommands(program);
registerSteeringCommands(program);
registerAssetCommands(program);

program.parseAsync(process.argv).catch((e) => {
  console.error(`hx: ${(e as Error).message}`);
  process.exit(1);
});
