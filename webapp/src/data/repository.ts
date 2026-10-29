import { demoData } from "./demo-data";
import type { DemoItem } from "../types";

const LATENCY_MS = 300;

/**
 * Temporary local repository. Replace the body with the local Node API when
 * OAuth and sync land; the page contract stays "list of triage items".
 */
export async function fetchBrief(): Promise<DemoItem[]> {
  await new Promise((resolve) => window.setTimeout(resolve, LATENCY_MS));
  return demoData.items;
}
