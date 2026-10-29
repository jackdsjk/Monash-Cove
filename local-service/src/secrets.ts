import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ACCOUNT = "cove-local";

export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemorySecretStore implements SecretStore {
  private readonly values = new Map<string, string>();

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string) {
    this.values.set(key, value);
  }

  async delete(key: string) {
    this.values.delete(key);
  }
}

export class MacKeychainStore implements SecretStore {
  async get(key: string) {
    try {
      const { stdout } = await execFileAsync("security", ["find-generic-password", "-a", ACCOUNT, "-s", key, "-w"]);
      return stdout.replace(/\n$/, "");
    } catch {
      return null;
    }
  }

  async set(key: string, value: string) {
    await execFileAsync("security", ["add-generic-password", "-a", ACCOUNT, "-s", key, "-w", value, "-U"]);
  }

  async delete(key: string) {
    try {
      await execFileAsync("security", ["delete-generic-password", "-a", ACCOUNT, "-s", key]);
    } catch {
      // already absent
    }
  }
}

export function defaultSecretStore(): SecretStore {
  if (process.env.COVE_SECRET_STORE === "memory") return new MemorySecretStore();
  if (process.platform === "darwin") return new MacKeychainStore();
  return new MemorySecretStore();
}
