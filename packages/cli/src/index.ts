#!/usr/bin/env node
import { Command } from "commander";
import { registerFoundationCommands } from "./foundation.js";
import { registerGateCommands } from "./gates.js";
import { registerBehaviourCommands } from "./behaviour.js";
import { registerSteeringCommands } from "./steering.js";
import { registerAssetCommands } from "./assets.js";
import { registerOrchestrationCommands } from "./orchestration.js";
import { registerMcpCommand } from "./mcp.js";
import { registerRemoteCommands } from "./remote.js";
import { VERSION } from "@harnessx/core";

export const program = new Command("hx")
  .description("HarnessX — outer harness for AI coding agents")
  .version(VERSION);

registerFoundationCommands(program);
registerGateCommands(program);
registerBehaviourCommands(program);
registerSteeringCommands(program);
registerAssetCommands(program);
registerOrchestrationCommands(program);
registerMcpCommand(program);
registerRemoteCommands(program);

program.parseAsync(process.argv).catch((e) => {
  console.error(`hx: ${(e as Error).message}`);
  process.exit(1);
});
