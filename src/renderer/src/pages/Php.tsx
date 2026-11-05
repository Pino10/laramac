import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ArrowUpCircle, Bug, FileCog, FolderPlus, Puzzle } from "lucide-react";
import type { PhpVersionInfo } from "@shared/types";
import { useApp } from "../store";
import { PageHead, Switch } from "../ui";
import { PhpQuickSettings, PhpTools } from "../components/PhpDev";

export default function Php(): React.JSX.Element {
  const {
    php,
    settings,
    act,
    busy,
    setPhp,
    jobs,
    sites,
    setPage,
    updateSettings,
  } = useApp();
  const api = window.laramac;
  const [extsFor, setExtsFor] = useState<PhpVersionInfo | null>(null);
  const [extQ, setExtQ] = useState('')
  const installing = jobs.some(
    (j) => j.status === "running" && j.label.includes("PHP"),
  );
  const def = php.find((p) => p.isDefault);
  const usage = (minor: string): number =>
    sites.filter((s) => s.php === minor).length;
  const updates = php.filter((p) => p.updateAvailable);
  const install = (minor: string): Promise<unknown> =>
    act(`install-php-${minor}`, () =>
      api.invoke("php:install", minor).then(setPhp),
    );

  return (
    <>
      <button className="back-link" onClick={() => setPage("languages")}>
        <ArrowLeft size={14} /> Languages
      </button>
      <PageHead
        title="PHP"
        desc="Laramac gives you the newest PHP and keeps it up to date. Need an older one for a project? Add it from a download and pick it per site."
      >
        <button
          className="btn"
          disabled={busy.has("php-import") || installing}
          onClick={async () => {
            const r = await act("php-import", () => api.invoke("php:import"));
            if (r) setPhp(r);
          }}
        >
          <FolderPlus size={14} />{" "}
          {busy.has("php-import") ? "Adding…" : "Add a version"}
        </button>
        {updates.length > 0 && (
          <button
            className="btn btn-primary"
            disabled={installing}
            onClick={async () => {
              for (const u of updates) await install(u.minor);
            }}
          >
            <ArrowUpCircle size={14} /> Update{" "}
            {updates.length === 1
              ? `PHP ${updates[0].minor}`
              : `all (${updates.length})`}
          </button>
        )}
      </PageHead>

      {def ? (
        <div className="php-hero glass">
          <div className="php-num">{def.minor}</div>
          <div style={{ flex: 1 }}>
            <div className="card-title">
              Default version
              {def.updateAvailable && (
                <span className="tag tag-accent">{def.latest} available</span>
              )}
            </div>
            <div className="dim">
              PHP {def.installed}, used by {usage(def.minor)}{" "}
              {usage(def.minor) === 1 ? "site" : "sites"}, new projects,
              Composer and the terminal.
            </div>
          </div>
          <button
            className="btn"
            onClick={() => api.invoke("php:edit-ini", def.minor)}
          >
            <FileCog size={14} /> Edit php.ini
          </button>
          <button className="btn" onClick={() => setPage("sites")}>
            Choose per site
          </button>
        </div>
      ) : (
        <div className="php-hero glass">
          <div className="php-num dim">·</div>
          <div>
            <div className="card-title">No PHP yet</div>
            <div className="dim">
              Install the newest version below to get started.
            </div>
          </div>
        </div>
      )}

      {def && (
        <div className={`xdebug-card glass${settings?.xdebug ? " on" : ""}`}>
          <span className="xdebug-icon">
            <Bug size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="card-title">
              Xdebug{" "}
              {settings?.xdebug ? (
                <span className="tag tag-accent">On</span>
              ) : (
                <span className="tag">Off</span>
              )}
            </div>
            <div className="dim">
              {settings?.xdebug
                ? "PHP pauses at your breakpoints. In VS Code or Cursor, install “PHP Debug” and press Run › Start Debugging (Listen for Xdebug). PhpStorm: click the phone icon. Turn it off when you are done: it slows PHP down."
                : "Step through your code line by line in VS Code, Cursor or PhpStorm. It stays off until you need it, because it makes PHP slower."}
            </div>
            {!settings?.xdebug && php.some((p) => p.installed && !p.xdebug) && (
              <div className="hint" style={{ marginTop: 4 }}>
                {php.some((p) => p.installed && !p.xdebug && p.xdebugAvailable)
                  ? "Turning it on updates your PHP to a build that includes Xdebug."
                  : 'Xdebug comes with Laramac’s newest PHP. Update to it, or wait for its next build (usually within a day).'}
              </div>
            )}
          </div>
          <Switch
            on={!!settings?.xdebug}
            label="Xdebug"
            disabled={busy.has("xdebug") || installing}
            onChange={async () => {
              const r = await act("xdebug", () =>
                api.invoke("php:xdebug", !settings?.xdebug),
              );
              if (r) {
                setPhp(r);
                await updateSettings({});
              }
            }}
          />
        </div>
      )}

      {php.length === 0 ? (
        <div className="panel empty">
          <strong>Could not load the version list</strong>
          <span className="dim">
            Laramac could not reach php.net or the build server. Check your
            connection.
          </span>
        </div>
      ) : (
        <div className="grid-3">
          {php.map((v) => {
            const state = v.isDefault
              ? "default"
              : v.installed
                ? "installed"
                : "available";
            const n = usage(v.minor);
            const pending =
              v.upstream && v.upstream !== v.latest && !v.installed;
            return (
              <div key={v.minor} className="card glass" data-state={state}>
                <div
                  className="card-head"
                  style={{ justifyContent: "space-between" }}
                >
                  <span className="php-tile-num">{v.minor}</span>
                  {v.updateAvailable ? (
                    <span className="tag tag-accent">Update</span>
                  ) : state === "default" ? (
                    <span className="tag tag-accent">Default</span>
                  ) : state === "installed" ? (
                    <span className="tag tag-ok">Installed</span>
                  ) : null}
                </div>
                <div className="hint">
                  {v.installed
                    ? v.updateAvailable
                      ? `${v.installed} installed, ${v.latest} is ready`
                      : `${v.installed}${n ? `, used by ${n} ${n === 1 ? "site" : "sites"}` : ""}`
                    : `Newest: ${v.latest}`}
                  {pending && (
                    <span style={{ display: "block" }}>
                      {v.upstream} is out on php.net and being built for your
                      Mac.
                    </span>
                  )}
                </div>
                {v.installed && v.extensions.length > 0 && (
                  <button
                    className="link hint"
                    style={{
                      alignSelf: "flex-start",
                      display: "flex",
                      gap: 5,
                      alignItems: "center",
                    }}
                    onClick={() => setExtsFor(v)}
                  >
                    <Puzzle size={12} /> {v.extensions.length} extensions
                  </button>
                )}
                <div className="card-foot">
                  {v.installed ? (
                    <>
                      {v.updateAvailable ? (
                        <button
                          className="btn btn-primary"
                          disabled={
                            busy.has(`install-php-${v.minor}`) || installing
                          }
                          onClick={() => install(v.minor)}
                        >
                          {busy.has(`install-php-${v.minor}`)
                            ? "Updating"
                            : `Update to ${v.latest}`}
                        </button>
                      ) : !v.isDefault ? (
                        <button
                          className="btn"
                          onClick={() =>
                            act(`default-${v.minor}`, () =>
                              api
                                .invoke("php:set-default", v.minor)
                                .then(setPhp),
                            )
                          }
                        >
                          Make default
                        </button>
                      ) : (
                        <button
                          className="btn btn-quiet"
                          onClick={() => api.invoke("php:edit-ini", v.minor)}
                        >
                          <FileCog size={14} /> php.ini
                        </button>
                      )}
                      <button
                        className="btn btn-quiet"
                        disabled={
                          busy.has(`remove-${v.minor}`) || n > 0 || v.isDefault
                        }
                        title={
                          n > 0
                            ? "Sites still use this version"
                            : v.isDefault
                              ? "Choose another default first"
                              : undefined
                        }
                        onClick={() =>
                          act(`remove-${v.minor}`, () =>
                            api.invoke("php:remove", v.minor).then(setPhp),
                          )
                        }
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn"
                      style={{ width: "100%" }}
                      disabled={
                        busy.has(`install-php-${v.minor}`) || installing
                      }
                      onClick={() => install(v.minor)}
                    >
                      {busy.has(`install-php-${v.minor}`)
                        ? "Installing"
                        : `Install ${v.latest}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {php.some((p) => p.installed) && <PhpQuickSettings />}
      <PhpTools />

      <div className="php-older glass">
        <FolderPlus
          size={16}
          style={{ color: "var(--ink-3)", flexShrink: 0 }}
        />
        <span>
          <strong>Need an older PHP?</strong> Download the macOS{" "}
          <span className="mono">cli</span> and{" "}
          <span className="mono">fpm</span> files for your Mac (
          {navigator.userAgent.includes("Intel")
            ? "Intel: x86_64"
            : "Apple Silicon: aarch64"}
          ) from{" "}
          <button
            className="link"
            onClick={() =>
              api.invoke(
                "tools:open-external",
                "https://dl.static-php.dev/static-php-cli/bulk/",
              )
            }
          >
            static-php.dev
          </button>
          , then press <strong>Add a version</strong> and choose both. Laramac
          checks they run and sets them up, the same way Laragon adds PHP from a
          zip.
        </span>
      </div>

      <p className="hint" style={{ marginTop: 14, maxWidth: "84ch" }}>
        Each build has its extensions compiled in, so nothing needs enabling.
        Laramac writes a php.ini tuned for local development and for the version
        (newer PHP releases deprecate some settings, which are left out). Your
        own lines go in “Edit php.ini” and always win. Using the{" "}
        {settings?.phpFlavor === "full" ? "full" : "lightweight"} extension set.
      </p>

      {extsFor && (
        <div className="scrim" onMouseDown={() => setExtsFor(null)}>
          <div
            className="dialog glass"
            style={{ width: 520 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="page-title" style={{ fontSize: 18 }}>
              PHP {extsFor.installed} extensions
            </h2>
            <p className="hint" style={{ margin: "4px 0 12px" }}>
              All built in and ready. No extension= lines needed.
            </p>
            <input className="input" placeholder="Is it there? Type an extension, such as gd or redis" value={extQ} onChange={(e) => setExtQ(e.target.value)} style={{ marginBottom: 10 }} aria-label="Find an extension" />
            {extQ && !extsFor.extensions.some((e) => e.toLowerCase().includes(extQ.toLowerCase())) && <p className="hint">Not in this build. Add an older or custom PHP with Add a version, or ask for it on GitHub.</p>}
            <div className="ext-list" style={{ maxHeight: 320 }}>
              {extsFor.extensions.filter((e) => e.toLowerCase().includes(extQ.toLowerCase())).map((e) => (
                <span key={e} className="tag">
                  {e}
                </span>
              ))}
            </div>
            <div className="end" style={{ marginTop: 16 }}>
              <button
                className="btn btn-primary"
                onClick={() => setExtsFor(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
