import rawData from "./demo-data.json";
import type { DemoData } from "../types";

// The fixture is a recorded model snapshot over anonymized samples. It is not
// live inference and contains no real account data.
export const demoData = rawData as DemoData;
