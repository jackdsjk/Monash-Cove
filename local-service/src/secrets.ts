import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

export class FileSecretStore implements SecretStore {
  private readonly file: string;

  constructor(file = process.env.COVE_SECRET_FILE ?? path.join(os.homedir(), ".cove", "secrets.json")) {
    this.file = file;
  }

  private async read() {
    try {
      return JSON.parse(await readFile(this.file, "utf8")) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private async write(values: Record<string, string>) {
    await mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    await writeFile(temporary, JSON.stringify(values), { mode: 0o600 });
    await rename(temporary, this.file);
    await chmod(this.file, 0o600);
  }

  async get(key: string) {
    return (await this.read())[key] ?? null;
  }

  async set(key: string, value: string) {
    const values = await this.read();
    values[key] = value;
    await this.write(values);
  }

  async delete(key: string) {
    const values = await this.read();
    delete values[key];
    await this.write(values);
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
  return new FileSecretStore();
}
