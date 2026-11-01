/**
 * Web scan with Nuclei: thousands of community checks for known problems, run against a local
 * site (through the web server, as that site) or an address you are allowed to test.
 * Denial-of-service and fuzzing checks are left out, and requests are rate limited.
 */
import { execFile, spawn } from "child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from "fs";
import { homedir } from "os";
import { join } from "path";
import type { ScanFinding, ScanResult } from "../shared/types";
import { dirs } from "./paths";
import {
  downloadFile,
  extract,
  removeQuarantine,
  sha256File,
  USER_AGENT,
} from "./download";
import { shaFor } from "./runtimes";

export const nucleiBinary = (): string =>
  join(dirs.root(), "runtimes", "security", "nuclei");

export function nucleiVersion(): Promise<string | null> {
  if (!existsSync(nucleiBinary())) return Promise.resolve(null);
  return new Promise((resolve) =>
    execFile(nucleiBinary(), ["-version"], { timeout: 10000 }, (_e, out, err) =>
      resolve(/v?(\d+\.\d+\.\d+)/.exec(`${out}${err}`)?.[1] ?? null),
    ),
  );
}

export async function installNuclei(
  update: (p: number | null, l?: string) => void,
): Promise<void> {
  const res = await fetch(
    "https://api.github.com/repos/projectdiscovery/nuclei/releases/latest",
    { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } },
  );
  if (!res.ok)
    throw new Error(`GitHub answered ${res.status} while looking for Nuclei.`);
  const rel = (await res.json()) as {
    tag_name: string;
    assets: { name: string; browser_download_url: string }[];
  };
  const v = rel.tag_name.replace(/^v/, "");
  const name = `nuclei_${v}_macOS_${process.arch === "arm64" ? "arm64" : "amd64"}.zip`;
  const asset = rel.assets.find((a) => a.name === name);
  const sums = rel.assets.find((a) => /checksums\.txt$/.test(a.name));
  if (!asset) throw new Error("No Nuclei build for this Mac was found.");
  const archive = join(dirs.downloads(), name);
  await downloadFile(asset.browser_download_url, archive, (p) =>
    update(p, "Downloading Nuclei"),
  );
  if (sums) {
    const text = await (
      await fetch(sums.browser_download_url, {
        headers: { "User-Agent": USER_AGENT },
      })
    ).text();
    const want = shaFor(text, name);
    if (want && (await sha256File(archive)) !== want) {
      rmSync(archive, { force: true });
      throw new Error(
        "The Nuclei download did not match its checksum and was deleted.",
      );
    }
  }
  const staging = `${archive}-staging`;
  rmSync(staging, { recursive: true, force: true });
  await extract(archive, staging);
  mkdirSync(join(dirs.root(), "runtimes", "security"), { recursive: true });
  rmSync(nucleiBinary(), { force: true });
  renameSync(join(staging, "nuclei"), nucleiBinary());
  chmodSync(nucleiBinary(), 0o755);
  await removeQuarantine(nucleiBinary());
  rmSync(staging, { recursive: true, force: true });
  rmSync(archive, { force: true });
}

/** Reads Nuclei's JSON lines into findings, most severe first. */
export function parseNuclei(jsonl: string): ScanFinding[] {
  const order = ["critical", "high", "medium", "low", "info", "unknown"];
  const out: ScanFinding[] = [];
  const seen = new Set<string>();
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line) as {
        "template-id": string;
        info: {
          name: string;
          severity: string;
          description?: string;
          remediation?: string;
          reference?: string[] | string;
        };
        "matched-at"?: string;
        host?: string;
      };
      const matched = j["matched-at"] ?? j.host ?? "";
      const key = `${j["template-id"]}|${matched}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const sev = (
        order.includes(j.info.severity) ? j.info.severity : "unknown"
      ) as ScanFinding["severity"];
      out.push({
        template: j["template-id"],
        name: j.info.name,
        severity: sev,
        matched,
        description: j.info.description?.trim(),
        remediation: j.info.remediation?.trim(),
        reference: Array.isArray(j.info.reference)
          ? j.info.reference.slice(0, 3)
          : j.info.reference
            ? [j.info.reference]
            : undefined,
      });
    } catch {
      // Not a finding line.
    }
  }
  return out.sort(
    (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity),
  );
}

const templatesDir = (): string => join(homedir(), "nuclei-templates");

export interface ScanOptions {
  url: string;
  /** For local sites: the site's name, sent as the Host header to the web server. */
  host?: string;
  /** Tests use their own checks instead of the downloaded library. */
  templates?: string;
  binary?: string;
}

export function nucleiArgs(o: ScanOptions, out: string): string[] {
  return [
    "-u",
    o.url,
    ...(o.host ? ["-H", `Host: ${o.host}`] : []),
    ...(o.templates ? ["-t", o.templates] : []),
    "-severity",
    "low,medium,high,critical",
    "-etags",
    "dos,fuzz,intrusive,bruteforce",
    "-rate-limit",
    "40",
    "-concurrency",
    "10",
    "-timeout",
    "8",
    "-jsonl",
    "-o",
    out,
    "-silent",
    "-no-color",
    "-disable-update-check",
  ];
}

export async function runNuclei(
  o: ScanOptions,
  update: (p: number | null, l?: string) => void,
): Promise<ScanResult> {
  const bin = o.binary ?? nucleiBinary();
  const started = Date.now();
  if (!o.templates && !existsSync(templatesDir())) {
    update(null, "Downloading the Nuclei check library (first time only)");
    await new Promise<void>((resolve, reject) =>
      execFile(
        bin,
        ["-update-templates", "-silent"],
        { timeout: 10 * 60 * 1000 },
        (err) =>
          err
            ? reject(
                new Error("The Nuclei check library could not be downloaded."),
              )
            : resolve(),
      ),
    );
  }
  const out = join(dirs.run(), `nuclei-${Date.now()}.jsonl`);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(bin, nucleiArgs(o, out), {
        stdio: ["ignore", "ignore", "pipe"],
      });
      let err = "";
      child.stderr.on("data", (d) => {
        err += d.toString();
        update(null, "Scanning");
      });
      const timer = setTimeout(() => child.kill("SIGTERM"), 30 * 60 * 1000);
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        code === 0 || existsSync(out)
          ? resolve()
          : reject(
              new Error(
                `Nuclei stopped: ${err.trim().split("\n").pop() ?? code}`,
              ),
            );
      });
    });
    const findings = existsSync(out)
      ? parseNuclei(readFileSync(out, "utf8"))
      : [];
    return {
      target: o.host ? `http://${o.host}` : o.url,
      findings,
      ms: Date.now() - started,
    };
  } finally {
    // The raw results are removed whether the scan finished or not.
    rmSync(out, { force: true });
  }
}
