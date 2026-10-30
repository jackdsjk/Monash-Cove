#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCoveMcpServer } from "./mcp.js";

const server = createCoveMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`Cove MCP stdio server ready; API ${process.env.COVE_API_URL ?? "http://127.0.0.1:4317"}`);
