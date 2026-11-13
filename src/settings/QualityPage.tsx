import { useSettings } from "@seconddawn/settings";
import { Button, Checkbox, Chip, Icon, ProgressBar, RadioGroup, Row, Section, Switch } from "@seconddawn/ui";
import { useState } from "react";
import { Dropdown } from "../components/Dropdown";
import { refreshQuality, useQualityStatus } from "../components/qualityStore";
import { inUseNote, sortedModels } from "../components/qualityText";
import { transferParts } from "../components/transfer";
import { formatBytes } from "../components/usePacks";
import { useT } from "../i18n";
import { ipc, type QualityPack, type QualityProgress, type QualityStatus } from "../ipc";
import { settingsStore } from "./store";

const gb = (bytes: number) => (bytes / 1e9).toFixed(1);

const TIER_KEY = { recommended: "quality.tier.recommended", alternative: "quality.tier.alternative", writing: "quality.tier.writing" } as const;

/** The progress line of a running download: "37% · 420 MB / 1.1 GB · 2.1 MB/s · 5 min left". */
function ProgressLine({ progress, label }: { progress: QualityProgress; label: string }) {
  const { t } = useT();
  if (progress.step === "verifying") return <span>{t("quality.verifying")}</span>;
  if (progress.step === "extracting") return <span>{t("quality.extracting")}</span>;
  const p = transferParts(progress.done, progress.total, progress.speed);
  const line = [`${p.percent}%`, p.sizes, p.speed, p.eta && t("quality.timeLeft", { time: p.eta })].filter(Boolean).join(" · ");
  return (
    <div className="quality-progress__text">
      <strong>{label}</strong> {line}
    </div>
  );
}

/** The download button of a model, with the engine's size when the engine comes along; progress and Cancel while it runs. */
function PackActions({ pack, status, progress, needsEngine }: { pack: QualityPack; status: QualityStatus; progress?: QualityProgress; needsEngine: boolean }) {
  const { t } = useT();
  const busy = (!!progress && progress.step !== "failed") || pack.installing;
  if (busy) {
    const label = progress?.part === "engine" ? t("quality.downloadingEngine") : t("quality.downloading");
    return (
      <div className="quality-progress">
        <ProgressBar value={progress?.done ?? 0} max={progress?.total || pack.sizeBytes} label={label} />
        {progress && <ProgressLine progress={progress} label={label} />}
        <Button onClick={() => void ipc.qualityCancel(pack.id)}>{t("common.cancel")}</Button>
      </div>
    );
  }
  if (pack.installed) {
    return (
      <Button variant="ghost" onClick={() => void ipc.qualityRemove(pack.id)}>
        {t("quality.remove")}
      </Button>
    );
  }
  const engine = needsEngine && status.runtime ? ` + ${formatBytes(status.runtime.sizeBytes)} ${t("quality.engineWord")}` : "";
  return (
    <div className="quality-progress">
      <Button icon="download" onClick={() => void ipc.qualityInstall(pack.id)}>
        {t("quality.download", { size: `${formatBytes(pack.sizeBytes)}${engine}` })}
      </Button>
      {progress?.step === "failed" && <span className="shortcut-warn">{t("quality.failed")}</span>}
    </div>
  );
}

function ModelRow({ pack, status, selectable, selected, onSelect }: { pack: QualityPack; status: QualityStatus; selectable: boolean; selected: boolean; onSelect: () => void }) {
  const { t } = useT();
  const [more, setMore] = useState(false);
  const progress = status.progress.find((p) => p.id === pack.id);
  const needsEngine = !!status.runtime && !status.runtime.installed;
  return (
    <div className="dw-row quality-model">
      <div className="dw-row__text">
        <div className="dw-row__title">
          {selectable ? (
            <label className="quality-pick">
              <input type="radio" name="quality-model" checked={selected} onChange={onSelect} />
              <span>{pack.name}</span>
            </label>
          ) : (
            <span>{pack.name}</span>
          )}
          <Chip tone={pack.tier === "recommended" ? "success" : undefined}>{t(TIER_KEY[pack.tier as keyof typeof TIER_KEY] ?? "quality.tier.alternative")}</Chip>
          {pack.installed && <Chip tone="success">{t("quality.installed")}</Chip>}
        </div>
        <div className="dw-row__desc">{pack.description}</div>
        {pack.tier === "writing" && <div className="dw-row__desc">{t("quality.writingNote")}</div>}
        <div className="dw-row__desc">{t("quality.modelFacts", { size: formatBytes(pack.sizeBytes), ram: gb(pack.ramBytes) })}</div>
        <button type="button" className="quality-more" aria-expanded={more} onClick={() => setMore(!more)}>
          <Icon name="chevron" size={12} /> {more ? t("quality.less") : t("quality.more")}
        </button>
        {more && (
          <div className="quality-more__body">
            {pack.details && <p>{pack.details}</p>}
            <p>{t("quality.credit", { license: pack.license, source: pack.attribution })}</p>
          </div>
        )}
      </div>
      <PackActions pack={pack} status={status} progress={progress} needsEngine={needsEngine} />
    </div>
  );
}

/** One line for the state, naming only what is missing. */
function StatusLine({ status, mode }: { status: QualityStatus; mode: "builtin" | "ollama" }) {
  const { t } = useT();
  const { patch } = useSettings(settingsStore);
  const running = status.progress.find((p) => p.step !== "failed" && p.step !== "done");
  const text = (() => {
    switch (status.state) {
      case "not_set_up":
        return t(status.missing === "engine" ? "quality.state.needEngine" : status.missing === "ollama_model" ? "quality.state.needOllamaModel" : "quality.state.needModel");
      case "downloading": {
        const p = running ? transferParts(running.done, running.total, running.speed).percent : 0;
        return t("quality.state.downloading", { percent: p });
      }
      case "ready":
        return t("quality.state.ready");
      case "loading":
        return t("quality.state.loading");
      case "loaded":
        return t("quality.state.loaded");
      case "unavailable":
        return t(status.missing === "ollama_models" ? "quality.state.ollamaNoModels" : "quality.state.ollamaMissing");
      default:
        return "";
    }
  })();
  const tone = status.state === "ready" || status.state === "loaded" ? "success" : "warn";
  return (
    <div className="dw-row" role="status">
      <div className="dw-row__text">
        <Chip tone={tone}>{text}</Chip>
        {status.state === "unavailable" && mode === "ollama" && (
          <div className="quality-fix">
            <Button onClick={() => void patch({ qualityMode: "builtin" })}>{t("quality.useBuiltin")}</Button>
            <Button variant="ghost" onClick={refreshQuality}>
              {t("quality.ollama.refresh")}
            </Button>
          </div>
        )}
        {status.state === "not_set_up" && status.missing === "engine" && status.runtime && (
          <div className="quality-fix">
            <Button icon="download" onClick={() => void ipc.qualityInstall(status.runtime!.id)}>
              {t("quality.download", { size: formatBytes(status.runtime.sizeBytes) })}
            </Button>
          </div>
        )}
      </div>
      {status.loaded && <Button onClick={() => void ipc.qualityUnload().then(refreshQuality)}>{t("quality.unload")}</Button>}
    </div>
  );
}

/** Settings, Quality mode: off by default, then the engine, the downloads, the memory it needs and its options. */
export function QualityPage() {
  const { t } = useT();
  const { settings, patch } = useSettings(settingsStore);
  // The page needs the packs even while the mode is off (to offer the download).
  const status = useQualityStatus(true, [settings.qualityMode, settings.qualityModel, settings.ollamaModel]);

  const on = settings.qualityMode !== "off";
  const mode = settings.qualityMode === "ollama" ? "ollama" : "builtin";
  const models = status ? sortedModels(status.models) : [];
  const model = status?.models.find((m) => m.id === status.selectedModel) ?? models.find((m) => m.tier === "recommended");
  const note = status ? inUseNote(status) : null;
  const mem = status?.memory;
  const ollama = status?.ollama;

  return (
    <>
      <Section title={t("quality.section")} description={t("quality.intro")}>
        <Row title={t("quality.use")} description={t("quality.useDesc")}>
          <Switch label={t("quality.use")} checked={on} onChange={(v) => void patch({ qualityMode: v ? (settings.ollamaModel && !model?.installed ? "ollama" : "builtin") : "off" })} />
        </Row>
        {on && (
          <div className="dw-row">
            <div className="dw-row__text">
              <div className="dw-row__title">{t("quality.engine")}</div>
              <div className="row-extra">
                <RadioGroup
                  name="quality-engine"
                  value={mode}
                  onChange={(v) => void patch({ qualityMode: v })}
                  options={[
                    { value: "builtin", label: t("quality.engineBuiltin"), description: t("quality.engineBuiltinDesc") },
                    { value: "ollama", label: t("quality.engineOllama"), description: t("quality.engineOllamaDesc") },
                  ]}
                />
              </div>
            </div>
          </div>
        )}
        {on && status && <StatusLine status={status} mode={mode} />}
      </Section>

      {mode === "builtin" && (
        <Section title={t("quality.builtin.section")} description={t("quality.builtin.intro")}>
          {status?.runtime && (
            <div className="dw-row quality-engine">
              <div className="dw-row__text">
                <div className="dw-row__title">
                  {t("quality.runtime")}
                  {status.runtime.installed ? <Chip tone="success">{t("quality.installed")}</Chip> : <Chip>{t("quality.engineWithModel")}</Chip>}
                </div>
                <div className="dw-row__desc">{t("quality.runtimeDesc", { size: formatBytes(status.runtime.sizeBytes), license: status.runtime.license })}</div>
              </div>
              {status.runtime.installed && (
                <Button variant="ghost" onClick={() => void ipc.qualityRemove(status.runtime!.id)}>
                  {t("quality.remove")}
                </Button>
              )}
            </div>
          )}
          {status && models.map((m) => <ModelRow key={m.id} pack={m} status={status} selectable selected={status.selectedModel === m.id} onSelect={() => void patch({ qualityModel: m.id })} />)}
          {note && (
            <div className="dw-row" role="status">
              <span className="dw-row__desc">{t("quality.usingOther", { requested: note.requested, used: note.used })}</span>
            </div>
          )}
          {status && status.models.length > 0 && (
            <div className="dw-row">
              <span className="dw-row__desc">{t("quality.tiersNote")}</span>
            </div>
          )}
          {status && status.models.length === 0 && (
            <div className="dw-row">
              <span className="dw-row__desc">{t("quality.noPacks")}</span>
            </div>
          )}
        </Section>
      )}

      {mode === "ollama" && on && (
        <Section title={t("quality.ollama.section")} description={t("quality.ollama.intro")}>
          <Row title={t("quality.ollama.status")} description={ollama?.running ? t("quality.ollama.found", { count: ollama.models.length }) : t("quality.ollama.notFound")}>
            <Button onClick={refreshQuality}>{t("quality.ollama.refresh")}</Button>
          </Row>
          {ollama?.running && ollama.models.length > 0 && (
            <Row title={t("quality.ollama.model")} description={t("quality.ollama.modelDesc")}>
              <Dropdown
                label={t("quality.ollama.model")}
                value={settings.ollamaModel}
                onChange={(v) => void patch({ ollamaModel: v })}
                placeholder={t("quality.ollama.choose")}
                options={ollama.models.map((m) => ({ value: m.name, label: `${m.name} (${gb(m.size)} GB)` }))}
              />
            </Row>
          )}
        </Section>
      )}

      {on && (
        <Section title={t("quality.memory.section")}>
          {mem && mode === "builtin" && model && (
            <div className="dw-row">
              <div className="dw-row__text">
                <div className="dw-row__desc">{t("quality.memory.info", { need: gb(model.ramBytes), total: gb(mem.total), free: gb(mem.available) })}</div>
                {mem.lowTotal && <div className="shortcut-warn">{t("quality.memory.low")}</div>}
                {mem.tooLittleFree && <div className="shortcut-warn">{t("quality.memory.tooLittleFree")}</div>}
              </div>
            </div>
          )}
          <Row title={t("quality.idle")} description={t("quality.idleDesc")}>
            <Dropdown
              label={t("quality.idle")}
              value={String(settings.qualityIdleMinutes)}
              onChange={(v) => void patch({ qualityIdleMinutes: Number(v) })}
              options={["1", "2", "5", "10", "30"].map((m) => ({ value: m, label: t("quality.idleMinutes", { count: m }) }))}
            />
          </Row>
          <div className="dw-row">
            <div className="dw-row__text">
              <Checkbox checked={settings.livePolish} onChange={(v) => void patch({ livePolish: v })}>
                {t("quality.livePolish")}
              </Checkbox>
              <div className="dw-row__desc">{t("quality.livePolishDesc")}</div>
            </div>
          </div>
        </Section>
      )}

      <Section title={t("quality.privacy.section")}>
        <div className="dw-row">
          <span className="dw-row__desc">{t("quality.privacy")}</span>
        </div>
      </Section>
    </>
  );
}
