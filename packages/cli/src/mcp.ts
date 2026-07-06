import fs from "node:fs";
import { Command } from "commander";
import { Workspace, runMcpStdioServer, gitChangedFiles } from "@harnessx/core";
import { builtinSensors } from "@harnessx/sensors";

export function registerMcpCommand(program: Command): void {
  program
    .command("mcp")
    .description("MCP stdio server — exposes gate_check, guide_pack, change_status, trace_check (Trae/Qoder bridge)")
    .action(() => {
      const ws = Workspace.locate(process.cwd());
      if (!fs.existsSync(ws.harnessFile)) {
        console.error("hx mcp: harnessX/ not initialized in this repository");
        process.exit(1);
      }
      runMcpStdioServer(ws, {
        builtins: builtinSensors,
        changedFiles: gitChangedFiles(ws.root)
      });
    });
}
