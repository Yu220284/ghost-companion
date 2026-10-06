"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchHarnessStatus,
  resetAgentSessions,
  streamAgentTurn,
  type HarnessStatus,
  type TurnOutcome,
} from "@/lib/agent/client";
import type { AgentStreamEvent } from "@/lib/agent/types";
import { GrantPicker } from "@/components/party/GrantPicker";
import { Button } from "@/components/ui/button";
import {
  grantsFor,
  loadGrants,
  saveGrants,
  type GrantsMap,
} from "@/lib/grants-store";
import {
  configFor,
  loadConfigs,
  saveConfigs,
  type ConfigMap,
} from "@/lib/pet-config-store";
import { publishDeskConfig, publishDeskGrants } from "@/lib/desk-channel";
import type { PetGrants } from "@/lib/grants";
import {
  APP_CATALOG,
  MODEL_CATALOG,
  parsePetConfig,
  toolsForPetCatalog,
  type PetConfig,
  type PetImageModelId,
} from "@/lib/pet-config";
import { useDesk } from "@/lib/hooks/use-desk";
import { useI18n } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";

const PET_ID = "ghost";

export type GhostWorkMode = "care" | "agent" | "image";

export function useGhostHarness(lang: "ja" | "en") {
  const { t } = useI18n();
  const desk = useDesk();
  const [harness, setHarness] = useState<HarnessStatus | null>(null);
  const [grantsMap, setGrantsMap] = useState<GrantsMap>({});
  const [configMap, setConfigMap] = useState<ConfigMap>({});
  const [policyDraft, setPolicyDraft] = useState("");
  const [imageModels, setImageModels] = useState<
    Array<{ id: string; label: string }>
  >([{ id: "auto", label: "Auto" }]);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const [pendingApproval, setPendingApproval] = useState<{
    tool: string;
    detail?: string;
  } | null>(null);

  useEffect(() => {
    setGrantsMap(loadGrants());
    const configs = loadConfigs();
    setConfigMap(configs);
    setPolicyDraft(configFor(configs, PET_ID).policy);
    void fetchHarnessStatus().then((status) => {
      setHarness(status);
      if (status.imageModels?.length) setImageModels(status.imageModels);
    });
  }, []);

  const grants = grantsFor(grantsMap, PET_ID);
  const config = configFor(configMap, PET_ID);

  const setGrants = useCallback((next: PetGrants) => {
    setGrantsMap((prev) => {
      const map = { ...prev, [PET_ID]: next };
      saveGrants(map);
      return map;
    });
    publishDeskGrants(PET_ID, next);
    void resetAgentSessions(PET_ID);
  }, []);

  const persistConfig = useCallback((next: PetConfig) => {
    const parsed = parsePetConfig(next);
    setConfigMap((prev) => {
      const map = { ...prev, [PET_ID]: parsed };
      saveConfigs(map);
      return map;
    });
    setPolicyDraft(parsed.policy);
    publishDeskConfig(PET_ID, parsed);
    void resetAgentSessions(PET_ID);
  }, []);

  const savePolicy = useCallback(() => {
    persistConfig({ ...configFor(loadConfigs(), PET_ID), policy: policyDraft });
  }, [persistConfig, policyDraft]);

  const harnessLabel =
    harness == null
      ? t.harness.checking
      : harness.runtime === "trueforge"
        ? t.harness.trueforge
        : harness.runtime === "openai"
          ? t.harness.openai
          : t.harness.offline;

  const runAgent = useCallback(
    async (input: {
      message?: string;
      approval?: "allow" | "deny";
      onDelta?: (text: string) => void;
    }): Promise<TurnOutcome> => {
      const out = await streamAgentTurn(
        {
          petId: PET_ID,
          locale: lang,
          sessionId: sessionIdRef.current,
          message: input.message,
          approval: input.approval,
          grants: grantsFor(loadGrants(), PET_ID),
          config: configFor(loadConfigs(), PET_ID),
        },
        (event: AgentStreamEvent, current) => {
          if (event.type === "text" || event.type === "done") {
            input.onDelta?.(current.text);
          }
        }
      );
      if (out.sessionId) sessionIdRef.current = out.sessionId;
      if (out.approval) {
        setPendingApproval({
          tool: out.approval.toolName,
          detail: out.approval.detail,
        });
      } else {
        setPendingApproval(null);
      }
      return out;
    },
    [lang]
  );

  const refreshHarness = useCallback(() => {
    void fetchHarnessStatus().then((status) => {
      setHarness(status);
      if (status.imageModels?.length) setImageModels(status.imageModels);
    });
  }, []);

  return {
    petId: PET_ID,
    harness,
    harnessLabel,
    grants,
    setGrants,
    config,
    persistConfig,
    imageModels,
    policyDraft,
    setPolicyDraft,
    savePolicy,
    pendingApproval,
    setPendingApproval,
    runAgent,
    refreshHarness,
    deskAvailable: desk.available,
  };
}

type HarnessMenuProps = {
  harnessLabel: string;
  grants: PetGrants;
  setGrants: (next: PetGrants) => void;
  deskAvailable: boolean;
  policyDraft: string;
  setPolicyDraft: (v: string) => void;
  savePolicy: () => void;
  config: PetConfig;
  persistConfig: (next: PetConfig) => void;
  imageModels: Array<{ id: string; label: string }>;
  workMode: GhostWorkMode;
  setWorkMode: (m: GhostWorkMode) => void;
  onRefreshHarness: () => void;
};

export function GhostHarnessMenu({
  harnessLabel,
  grants,
  setGrants,
  deskAvailable,
  policyDraft,
  setPolicyDraft,
  savePolicy,
  config,
  persistConfig,
  imageModels,
  workMode,
  setWorkMode,
  onRefreshHarness,
}: HarnessMenuProps) {
  const { locale, t } = useI18n();
  const ja = locale === "ja";
  const catalog = toolsForPetCatalog(PET_ID);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium text-[#302c55]">おはなし / おしごと</p>
        <div className="flex gap-2">
          <Button
            variant={workMode === "care" ? "care" : "careSoft"}
            size="lg"
            className="flex-1"
            onClick={() => setWorkMode("care")}
          >
            おはなし
          </Button>
          <Button
            variant={workMode === "agent" ? "care" : "careSoft"}
            size="lg"
            className="flex-1"
            onClick={() => setWorkMode("agent")}
          >
            おしごと
          </Button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[#302c55]/65">
          {workMode === "care"
            ? "話しかけ・調子の話。軽い返答。"
            : workMode === "image"
              ? "画像モード。描いてほしいものを送る。"
              : "TrueForge / サンドボックス付きエージェント。権限のある仕事を任せる。"}
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-[#302c55]">ハーネス · サンドボックス</p>
          <button
            type="button"
            className="text-xs text-[#e56b8c] underline-offset-2 hover:underline"
            onClick={onRefreshHarness}
          >
            再確認
          </button>
        </div>
        <p
          className={cn(
            "rounded-xl px-3 py-2 text-sm font-semibold",
            harnessLabel.includes("TrueForge") || harnessLabel === "TrueForge"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-[#f0f3f8] text-[#302c55]"
          )}
          data-testid="harness-badge"
        >
          {harnessLabel}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[#302c55]/65">
          TrueForge 起動時はサンドボックス（Daytona 等）付きで動くよ。オフライン時はローカル権限の範囲だけ。
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-[#302c55]">
          {t.gate.policyHeading}（AI Gateway）
        </p>
        <p className="mb-2 text-xs text-[#302c55]/65">{t.gate.policyHint}</p>
        <textarea
          value={policyDraft}
          onChange={(e) => setPolicyDraft(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-[#302c55]/20 bg-[#f7f8fb] px-3 py-2 text-sm text-[#302c55] outline-none focus:border-[#e56b8c]"
          placeholder={t.gate.policyPlaceholder}
        />
        <Button variant="careSoft" className="mt-2 w-full" onClick={savePolicy}>
          {t.gate.save}
        </Button>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-[#302c55]">
          {t.gate.modelHeading}
        </p>
        <p className="mb-2 text-xs text-[#302c55]/65">{t.gate.modelHint}</p>
        <select
          value={config.model}
          onChange={(e) =>
            persistConfig({
              ...config,
              model: e.target.value as PetConfig["model"],
            })
          }
          className="w-full rounded-xl border border-[#302c55]/20 bg-[#f7f8fb] px-3 py-2 text-sm text-[#302c55] outline-none focus:border-[#e56b8c]"
        >
          {MODEL_CATALOG.map((row) => (
            <option key={row.id} value={row.id}>
              {row.id === "auto"
                ? ja
                  ? "自動（ハーネス）"
                  : "Auto (harness)"
                : row.label}
            </option>
          ))}
        </select>
        <p className="mb-1 mt-3 text-sm font-medium text-[#302c55]">
          {t.gate.imageHeading}
        </p>
        <p className="mb-2 text-xs text-[#302c55]/65">
          {imageModels.length > 1 ? t.gate.imageHint : t.gate.imageNone}
        </p>
        <select
          value={config.imageModel}
          disabled={imageModels.length <= 1}
          onChange={(e) =>
            persistConfig({
              ...config,
              imageModel: e.target.value as PetImageModelId,
            })
          }
          className="w-full rounded-xl border border-[#302c55]/20 bg-[#f7f8fb] px-3 py-2 text-sm text-[#302c55] outline-none focus:border-[#e56b8c] disabled:opacity-50"
        >
          {imageModels.map((row) => (
            <option key={row.id} value={row.id}>
              {row.id === "auto" ? (ja ? "自動" : "Auto") : row.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-[#302c55]">
          {t.gate.toolsHeading}
        </p>
        <p className="mb-2 text-xs text-[#302c55]/65">{t.gate.toolsHint}</p>
        <div className="max-h-40 space-y-1 overflow-auto rounded-xl border border-[#302c55]/10 bg-white/70 p-2">
          {catalog.map((row) => {
            const on = !config.disabledTools.includes(row.name);
            return (
              <label
                key={row.name}
                className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-xs text-[#302c55]"
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => {
                    const next = on
                      ? [...config.disabledTools, row.name]
                      : config.disabledTools.filter((n) => n !== row.name);
                    persistConfig({ ...config, disabledTools: next });
                  }}
                />
                {ja ? row.ja : row.en}
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-[#302c55]">
          {t.gate.appsHeading}
        </p>
        <p className="mb-2 text-xs text-[#302c55]/65">{t.gate.appsHint}</p>
        <div className="max-h-32 space-y-1 overflow-auto rounded-xl border border-[#302c55]/10 bg-white/70 p-2">
          {APP_CATALOG.map((row) => {
            const on = config.apps.includes(row.id);
            return (
              <label
                key={row.id}
                className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-xs text-[#302c55]"
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => {
                    const next = on
                      ? config.apps.filter((id) => id !== row.id)
                      : [...config.apps, row.id];
                    persistConfig({ ...config, apps: next });
                  }}
                />
                {ja ? row.ja : row.en}
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-[#302c55]">
          {t.menu.grants}（ローカル・サンドボックス）
        </p>
        <GrantPicker
          grants={grants}
          deskAvailable={deskAvailable}
          onChange={setGrants}
        />
      </div>
    </div>
  );
}
