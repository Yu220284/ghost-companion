"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { GhostSprite } from "@/components/ghost/GhostSprite";
import {
  CARE_ACTIONS,
  DEFAULT_WAKE_WORDS,
  GHOST,
  type GhostStatus,
} from "@/data/ghost";
import type { MoveDir } from "@/data/ghost-looks";
import {
  extractHttpUrls,
  wantsScreenshot,
} from "@/lib/desk-actions";
import {
  pickRecorderMime,
  readyMicStream,
  transcribeBlob,
} from "@/lib/mic";
import {
  GhostHarnessMenu,
  useGhostHarness,
  type GhostWorkMode,
} from "@/components/ghost/GhostHarness";
import {
  loadVoiceSample,
  loadWakeWords,
  saveVoiceSample,
  saveWakeWords,
  speakReply,
} from "@/lib/ghost-voice";
import {
  postCompanionMessage,
  postLeap,
  requestOpenPairSheet,
} from "@/lib/companion/client";
import {
  useCompanion,
  usePhonePresence,
} from "@/lib/hooks/use-companion";
import { useI18n } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import type { GhostDeskMode } from "@/types/ghost-desktop";

type ChatLine = {
  id: string;
  role: "user" | "ghost";
  text: string;
  imageUrl?: string;
};
type Panel = "compact" | "talk" | "menu";
type Attach = { id: string; name: string; dataUrl: string };

export type GhostDeskHandle = {
  openTalk: () => void;
  ingestPhone: (text: string) => void;
};

type GhostDeskAppProps = {
  /** Electron /pet sticky: transparent chrome, drag, compact-first */
  sticky?: boolean;
  /** Nested in desk console — no full-viewport chrome / start gate */
  embedded?: boolean;
};

function speechCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function normalizeWake(s: string) {
  return s.toLowerCase().replace(/\s+/g, "");
}

export const GhostDeskApp = forwardRef<GhostDeskHandle, GhostDeskAppProps>(
  function GhostDeskApp({ sticky = false, embedded = false }, ref) {
  const desk =
    typeof window !== "undefined"
      ? window.ghostDesktop ??
        (window.petassist
          ? {
              isDesk: true as const,
              resize: (mode: GhostDeskMode) =>
                window.petassist!.resizeSticky(
                  "ghost",
                  mode === "talk" ? "chat" : mode === "menu" ? "menu" : "compact"
                ),
              show: () => window.petassist!.showSticky("ghost"),
              dragBegin: () => window.petassist!.dragBegin(),
              dragMove: () => window.petassist!.dragMove(),
              dragEnd: () => window.petassist!.dragEnd(),
              onHotkey: () => () => {},
            }
          : undefined)
      : undefined;
  const [panel, setPanel] = useState<Panel>(
    embedded ? "talk" : sticky ? "compact" : "talk"
  );
  const [status, setStatus] = useState<GhostStatus>("idle");
  const [lang, setLang] = useState<"ja" | "en">("ja");
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const [started, setStarted] = useState(embedded || sticky);
  const [wakeDraft, setWakeDraft] = useState(DEFAULT_WAKE_WORDS.join(", "));
  const [hasSample, setHasSample] = useState(false);
  const [recording, setRecording] = useState(false);
  const [moveDir, setMoveDir] = useState<MoveDir>(null);
  const [dragging, setDragging] = useState(false);
  const [eyeTick, setEyeTick] = useState(0);
  const [micBlocked, setMicBlocked] = useState(false);
  const [draft, setDraft] = useState("");
  const [workMode, setWorkMode] = useState<GhostWorkMode>("care");
  const [modeOpen, setModeOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attach[]>([]);
  const [drawing, setDrawing] = useState(false);
  const harness = useGhostHarness(lang);
  const workModeRef = useRef(workMode);
  const photoRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();
  const companion = useCompanion();
  const presence = usePhonePresence();
  // GoL/GoR only while dragging.
  const lookDir = dragging ? moveDir : null;

  useEffect(() => {
    workModeRef.current = workMode;
  }, [workMode]);

  const recogRef = useRef<SpeechRecognition | null>(null);
  const listenRecRef = useRef<MediaRecorder | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const listenChunksRef = useRef<Blob[]>([]);
  const mutedRef = useRef(false);
  const busyRef = useRef(false);
  const startedRef = useRef(false);
  const listenLoopRef = useRef(0);
  const panelRef = useRef(panel);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const wakeRef = useRef<string[]>(DEFAULT_WAKE_WORDS);
  const lastDragX = useRef<number | null>(null);
  const langRef = useRef(lang);

  useEffect(() => {
    panelRef.current = panel;
  }, [panel]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    startedRef.current = started;
  }, [started]);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  useEffect(() => {
    const saved = loadWakeWords();
    if (saved.length) {
      wakeRef.current = saved;
      setWakeDraft(saved.join(", "));
    }
    setHasSample(Boolean(loadVoiceSample()));
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, busy]);

  // Loading: Normal (mouth closed) + eye cycle U→R→D→L while waiting / speaking
  useEffect(() => {
    if (!busy && !muted) return;
    const id = window.setInterval(() => {
      setEyeTick((n) => n + 1);
    }, 220);
    return () => window.clearInterval(id);
  }, [busy, muted]);

  const resizeDesk = useCallback(
    (mode: GhostDeskMode) => {
      void desk?.resize(mode);
    },
    [desk]
  );

  const openTalk = useCallback(() => {
    setPanel("talk");
    resizeDesk("talk");
  }, [resizeDesk]);

  const openMenu = useCallback(() => {
    if (panelRef.current === "menu") {
      setPanel("talk");
      resizeDesk("talk");
      return;
    }
    setPanel("menu");
    resizeDesk("menu");
  }, [resizeDesk]);

  const toCompact = useCallback(() => {
    // Shrink the Electron window first so the sprite never paints at chat size.
    resizeDesk("compact");
    setPanel("compact");
  }, [resizeDesk]);

  const speakAndUnmute = useCallback(
    async (text: string) => {
      setMuted(true);
      await speakReply(text, lang, () => setMuted(false));
    },
    [lang]
  );

  const sendChat = useCallback(
    async (text: string, opts?: { toPhone?: boolean }) => {
      const trimmed = text.trim();
      const atts = attachments;
      if ((!trimmed && !atts.length) || busy || drawing) return;
      setAttachments([]);
      setLines((prev) => [
        ...prev,
        {
          id: `u-${Date.now()}`,
          role: "user",
          text: trimmed || (lang === "ja" ? "(画像)" : "(image)"),
          imageUrl: atts[0]?.dataUrl,
        },
      ]);
      setBusy(true);
      setStatus("talking");
      setMuted(true);

      if (workModeRef.current === "image") {
        setDrawing(true);
        setLines((prev) => [
          ...prev,
          { id: `g-draw-${Date.now()}`, role: "ghost", text: t.talk.drawing },
        ]);
        try {
          const res = await fetch("/api/agent/image", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              prompt: trimmed || t.talk.drawFromAttach,
              config: harness.config,
            }),
          });
          const json = (await res.json().catch(() => ({}))) as {
            url?: string;
            error?: string;
          };
          const fail = json.error || t.talk.drawFailed;
          if (!res.ok || !json.url) {
            setStatus("failed");
            setLines((prev) => [
              ...prev.filter((l) => !l.id.startsWith("g-draw-")),
              { id: `g-${Date.now()}`, role: "ghost", text: fail },
            ]);
          } else {
            setStatus("idle");
            setLines((prev) => [
              ...prev.filter((l) => !l.id.startsWith("g-draw-")),
              {
                id: `g-${Date.now()}`,
                role: "ghost",
                text: trimmed || t.talk.draw,
                imageUrl: json.url,
              },
            ]);
          }
        } catch {
          setStatus("failed");
          setLines((prev) => [
            ...prev.filter((l) => !l.id.startsWith("g-draw-")),
            { id: `g-${Date.now()}`, role: "ghost", text: t.talk.drawFailed },
          ]);
        } finally {
          setDrawing(false);
          setBusy(false);
          setMuted(false);
        }
        return;
      }

      const openedUrls: string[] = [];
      for (const url of extractHttpUrls(trimmed)) {
        try {
          if (window.petassist?.openUrl) {
            const res = await window.petassist.openUrl(url);
            if (res?.ok) openedUrls.push(url);
          } else {
            window.open(url, "_blank", "noopener,noreferrer");
            openedUrls.push(url);
          }
        } catch {
          /* ignore open failures */
        }
      }

      let imageBase64: string | undefined;
      let imageMime: string | undefined;
      let didScreenshot = false;
      if (atts[0]?.dataUrl) {
        const m = atts[0].dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (m) {
          imageMime = m[1];
          imageBase64 = m[2];
        }
      } else if (wantsScreenshot(trimmed)) {
        try {
          const shot = await window.petassist?.screenshot?.();
          if (shot?.ok && shot.base64) {
            imageBase64 = shot.base64;
            imageMime = shot.mime || "image/jpeg";
            didScreenshot = true;
          }
        } catch {
          /* ignore capture failures */
        }
      }

      try {
        if (workModeRef.current === "agent") {
          const out = await harness.runAgent({ message: trimmed });
          const reply =
            out.error ||
            out.text ||
            (lang === "ja" ? "……。" : "…");
          if (out.error) setStatus("failed");
          else setStatus("idle");
          setLines((prev) => [
            ...prev,
            { id: `g-${Date.now()}`, role: "ghost", text: reply },
          ]);
          if (opts?.toPhone) {
            void postCompanionMessage({ id: "ghost", text: reply, as: "pet" });
          }
          await speakAndUnmute(reply);
          return;
        }

        const res = await fetch("/api/ghost/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            lang,
            imageBase64,
            imageMime,
            openedUrls,
            didScreenshot,
          }),
        });
        const data = (await res.json()) as { reply?: string; failed?: boolean };
        const reply =
          data.reply ??
          (lang === "ja" ? "……。" : "…");
        if (!res.ok || data.failed) setStatus("failed");
        else setStatus("idle");
        setLines((prev) => [
          ...prev,
          { id: `g-${Date.now()}`, role: "ghost", text: reply },
        ]);
        if (opts?.toPhone) {
          void postCompanionMessage({ id: "ghost", text: reply, as: "pet" });
        }
        await speakAndUnmute(reply);
      } catch {
        setStatus("failed");
        setMuted(false);
      } finally {
        setBusy(false);
      }
    },
    [
      attachments,
      busy,
      drawing,
      lang,
      speakAndUnmute,
      harness,
      t.talk.drawing,
      t.talk.drawFailed,
      t.talk.drawFromAttach,
      t.talk.draw,
    ]
  );

  const sendChatRef = useRef(sendChat);
  sendChatRef.current = sendChat;

  useImperativeHandle(
    ref,
    () => ({
      openTalk,
      ingestPhone: (text: string) => {
        openTalk();
        void sendChatRef.current(text, { toPhone: true });
      },
    }),
    [openTalk]
  );

  const resolveApproval = useCallback(
    async (approval: "allow" | "deny") => {
      if (busy) return;
      setBusy(true);
      setStatus("talking");
      setMuted(true);
      setLines((prev) => [
        ...prev,
        {
          id: `u-${Date.now()}`,
          role: "user",
          text: approval === "allow" ? "みとめる" : "だめ",
        },
      ]);
      try {
        const out = await harness.runAgent({ approval });
        const reply =
          out.error ||
          out.text ||
          (lang === "ja" ? "……。" : "…");
        if (out.error) setStatus("failed");
        else setStatus("idle");
        setLines((prev) => [
          ...prev,
          { id: `g-${Date.now()}`, role: "ghost", text: reply },
        ]);
        await speakAndUnmute(reply);
      } catch {
        setStatus("failed");
        setMuted(false);
      } finally {
        setBusy(false);
      }
    },
    [busy, harness, lang, speakAndUnmute]
  );

  const matchesWake = useCallback((transcript: string) => {
    const t = normalizeWake(transcript);
    return wakeRef.current.some((w) => t.includes(normalizeWake(w)));
  }, []);

  const stopRecog = useCallback(() => {
    try {
      recogRef.current?.stop();
    } catch {
      /* ignore */
    }
    recogRef.current = null;
    setListening(false);
  }, []);

  const startRecog = useCallback(() => {
    const Ctor = speechCtor();
    if (!Ctor || mutedRef.current) return;
    stopRecog();
    const recog = new Ctor();
    recogRef.current = recog;
    recog.lang = lang === "ja" ? "ja-JP" : "en-US";
    recog.continuous = true;
    recog.interimResults = true;
    recog.onresult = (ev: SpeechRecognitionEvent) => {
      if (mutedRef.current) return;
      const text = ev.results[ev.results.length - 1]?.[0]?.transcript?.trim() ?? "";
      if (!text) return;
      const inTalk = panelRef.current === "talk";
      if (!inTalk) {
        if (matchesWake(text)) {
          openTalk();
          void sendChat(text);
        }
        return;
      }
      void sendChat(text);
    };
    recog.onerror = (ev: SpeechRecognitionErrorEvent) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      setListening(false);
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        setStatus("failed");
      }
    };
    recog.onend = () => {
      setListening(false);
      if (!mutedRef.current && started) {
        setTimeout(() => startRecog(), 280);
      }
    };
    try {
      recog.start();
      setListening(true);
      setStatus((s) => (s === "failed" ? "idle" : s));
    } catch {
      setStatus("failed");
    }
  }, [lang, matchesWake, openTalk, sendChat, started, stopRecog]);

  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    void (async () => {
      const mic = await readyMicStream();
      if (cancelled) return;
      if (!mic.ok) {
        setMicBlocked(mic.reason === "denied");
        setStatus("failed");
        return;
      }
      if (!speechCtor()) {
        setStatus("failed");
        setLines((prev) => [
          ...prev,
          {
            id: `g-${Date.now()}`,
            role: "ghost",
            text:
              lang === "ja"
                ? "この環境では音声認識が使えないよ。文字で話してね。"
                : "Speech recognition isn’t available here. Type instead.",
          },
        ]);
        return;
      }
      startRecog();
    })();
    return () => {
      cancelled = true;
      stopRecog();
    };
  }, [started, startRecog, stopRecog, lang]);

  useEffect(() => {
    if (!desk?.onHotkey) return;
    return desk.onHotkey(() => {
      openTalk();
      setStarted(true);
    });
  }, [desk, openTalk]);

  const toggleDock = useCallback(() => {
    setStarted(true);
    if (panelRef.current === "compact") openTalk();
    else toCompact();
  }, [openTalk, toCompact]);

  const onSpritePointerDown = (e: ReactPointerEvent) => {
    if (!desk) {
      e.preventDefault();
      toggleDock();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    let dragged = false;
    let dir: MoveDir = null;
    lastDragX.current = e.clientX;
    // Main process tracks the cursor; renderer only starts/stops + faces L/R.
    const move = (ev: PointerEvent) => {
      if (
        !dragged &&
        Math.hypot(ev.clientX - startX, ev.clientY - startY) > 3
      ) {
        dragged = true;
        setDragging(true);
        desk.dragBegin();
      }
      if (!dragged) return;
      const prev = lastDragX.current;
      if (prev != null) {
        const dx = ev.clientX - prev;
        if (Math.abs(dx) > 3) {
          const next: MoveDir = dx < 0 ? "L" : "R";
          if (next !== dir) {
            dir = next;
            setMoveDir(next);
          }
        }
      }
      lastDragX.current = ev.clientX;
    };
    const up = () => {
      if (dragged) desk.dragEnd();
      else toggleDock();
      lastDragX.current = null;
      setMoveDir(null);
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const beginMic = async () => {
    const mic = await readyMicStream();
    setStarted(true);
    openTalk();
    if (!mic.ok) {
      setMicBlocked(mic.reason === "denied");
      setStatus("failed");
      setLines((prev) => [
        ...prev,
        {
          id: `g-${Date.now()}`,
          role: "ghost",
          text:
            lang === "ja"
              ? "マイクがオフになってるよ。システム設定で Electron（または Ghost Companion）のマイクをオンにしてね。"
              : "Microphone is blocked. Enable it for Electron / Ghost Companion in System Settings.",
        },
      ]);
      void window.petassist?.openMicSettings?.();
    } else {
      setMicBlocked(false);
    }
  };

  const onCare = (id: string, prompt: string | null) => {
    openTalk();
    void (async () => {
      const mic = await readyMicStream();
      setStarted(true);
      if (!mic.ok) {
        setMicBlocked(mic.reason === "denied");
        setStatus("failed");
        return;
      }
      if (prompt) void sendChat(prompt);
      else setStatus("talking");
    })();
  };

  const startSampleRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecRef.current = rec;
      rec.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          const url = typeof reader.result === "string" ? reader.result : null;
          saveVoiceSample(url);
          setHasSample(Boolean(url));
        };
        reader.readAsDataURL(blob);
        setRecording(false);
      };
      rec.start();
      setRecording(true);
      setTimeout(() => {
        if (mediaRecRef.current === rec && rec.state === "recording") rec.stop();
      }, 4000);
    } catch {
      setStatus("failed");
    }
  };

  const stopSampleRecord = () => {
    if (mediaRecRef.current?.state === "recording") {
      mediaRecRef.current.stop();
    }
  };

  const saveWake = () => {
    const words = wakeDraft
      .split(/[,、]/)
      .map((w) => w.trim())
      .filter(Boolean);
    wakeRef.current = words.length ? words : DEFAULT_WAKE_WORDS;
    saveWakeWords(wakeRef.current);
    setWakeDraft(wakeRef.current.join(", "));
  };

  const loading = busy || muted || drawing;
  // Mouth stays closed while loading; Open only after the wait ends and we're speaking.
  const mouthOpen = !loading && status === "talking";
  const floatSpeed = status === "talking" ? 3.4 : status === "failed" ? 5.2 : 6.4;
  const floatAmp = status === "failed" ? 3 : 11;
  const dockOpen = panel !== "compact";
  const composerPad = sticky;
  const modeLabel =
    workMode === "care"
      ? lang === "ja"
        ? "おはなし"
        : "Talk"
      : workMode === "agent"
        ? t.talk.modes.agent
        : t.talk.modes.image;
  const modeHint =
    workMode === "care"
      ? lang === "ja"
        ? "メッセージ…"
        : "Message…"
      : workMode === "agent"
        ? t.talk.modeHint.agent
        : t.talk.modeHint.image;
  const canSend =
    !busy && !drawing && (Boolean(draft.trim()) || attachments.length > 0);
  const onPhone =
    presence.locations.ghost === "phone" ||
    presence.locations.ghost === "transit";

  const connectPhone = () => {
    if (companion) {
      void companion.openPairSheet();
      return;
    }
    void window.petassist?.showDock();
    requestOpenPairSheet();
  };

  const jumpToPhone = () => {
    const seed = lines
      .filter((l) => l.text.trim())
      .map((l) => ({
        from: (l.role === "user" ? "pc" : "pet") as "pc" | "pet",
        text: l.text,
      }));
    if (companion) {
      void companion.leapToPhone("ghost", seed);
      return;
    }
    const t0 = Date.now();
    void window.petassist?.leapPet?.("ghost", "out");
    void postLeap({ id: "ghost", from: "pc", to: "phone", t0, seed });
  };

  const sprite = (
    <GhostSprite
      status={status}
      moveDir={lookDir}
      loading={loading}
      mouthOpen={mouthOpen}
      eyeTick={eyeTick}
      floatAmp={dockOpen && sticky ? 4 : floatAmp}
      floatSpeed={floatSpeed}
      paused={dragging}
      sizeClassName={
        sticky
          ? dockOpen
            ? "h-[6.75rem] w-auto max-h-full max-w-[5.25rem]"
            : // Fixed size — never h-full (chat window can still be large for a frame).
              "h-[12.5rem] w-auto max-h-[13rem] max-w-[9rem]"
          : "h-40 w-auto max-w-[11rem] sm:h-36"
      }
      className={cn(
        status === "failed" && "opacity-90",
        status === "talking" &&
          "drop-shadow-[0_0_12px_rgba(43,125,255,0.45)]"
      )}
    />
  );

  const dockBody: ReactNode =
    panel === "menu" ? (
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3 pb-20">
        <div className="relative z-20 flex shrink-0 items-center gap-1">
          <p className="min-w-0 flex-1 truncate text-[10px] font-semibold text-slate-500">
            {GHOST.nameJa}
          </p>
          <button
            type="button"
            className="text-[10px] font-semibold text-[#24365c] hover:text-[#1a3f86]"
            onClick={openMenu}
          >
            {lang === "ja" ? "メニュー" : "Menu"}
          </button>
        </div>
        <GhostHarnessMenu
          harnessLabel={harness.harnessLabel}
          grants={harness.grants}
          setGrants={harness.setGrants}
          deskAvailable={harness.deskAvailable}
          policyDraft={harness.policyDraft}
          setPolicyDraft={harness.setPolicyDraft}
          savePolicy={harness.savePolicy}
          config={harness.config}
          persistConfig={harness.persistConfig}
          imageModels={harness.imageModels}
          workMode={workMode}
          setWorkMode={setWorkMode}
          onRefreshHarness={harness.refreshHarness}
        />
        <div>
          <p className="mb-2 text-sm font-medium text-[#24365c]">ことば</p>
          <div className="flex gap-2">
            <Button
              variant={lang === "ja" ? "care" : "careSoft"}
              size="lg"
              className="flex-1"
              onClick={() => setLang("ja")}
            >
              JA
            </Button>
            <Button
              variant={lang === "en" ? "care" : "careSoft"}
              size="lg"
              className="flex-1"
              onClick={() => setLang("en")}
            >
              EN
            </Button>
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-[#24365c]">よびかけ</p>
          <input
            value={wakeDraft}
            onChange={(e) => setWakeDraft(e.target.value)}
            className="w-full rounded-xl border border-[#24365c]/20 bg-[#f5f8ff] px-3 py-3 text-base text-[#24365c] outline-none focus:border-[#2b7dff]"
          />
          <Button variant="careSoft" className="mt-2 w-full" onClick={saveWake}>
            保存
          </Button>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-[#24365c]">こえ</p>
          <div className="flex gap-2">
            <Button
              variant="care"
              size="lg"
              className="flex-1"
              onClick={() =>
                recording ? stopSampleRecord() : void startSampleRecord()
              }
            >
              {recording ? "とめる" : "ろくおん"}
            </Button>
            <Button
              variant="careSoft"
              size="lg"
              className="flex-1"
              onClick={() => {
                saveVoiceSample(null);
                setHasSample(false);
              }}
            >
              けす
            </Button>
          </div>
          <div
            className={cn(
              "mt-3 h-2 rounded-full",
              hasSample ? "bg-[#2b7dff]" : "bg-[#24365c]/15"
            )}
            aria-hidden
          />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-[#24365c]">スマホ</p>
          {presence.paired ? (
            onPhone ? (
              <p className="rounded-xl bg-white/80 px-3 py-2 text-sm text-[#24365c]/70">
                {t.companion.onPhone}
              </p>
            ) : (
              <Button variant="care" className="w-full" onClick={jumpToPhone}>
                {t.companion.jumpToPhone}
              </Button>
            )
          ) : (
            <Button variant="care" className="w-full" onClick={connectPhone}>
              {t.menu.connectPhone}
            </Button>
          )}
        </div>
      </div>
    ) : (
      <div className="flex h-full min-h-0 flex-col p-2.5 text-[#24365c]">
        <div className="relative z-20 flex shrink-0 items-center gap-1">
          <p className="min-w-0 flex-1 truncate text-[10px] font-semibold text-slate-500">
            {GHOST.nameJa}
          </p>
          {listening ? (
            <span
              className="h-2 w-2 animate-pulse rounded-full bg-[#2b7dff]"
              aria-hidden
            />
          ) : null}
          <button
            type="button"
            className="text-[10px] font-semibold text-slate-400 hover:text-[#24365c]"
            onClick={openMenu}
          >
            {lang === "ja" ? "メニュー" : "Menu"}
          </button>
        </div>

        <div
          className={cn(
            "mt-1 min-h-0 flex-1 space-y-1.5 overflow-y-auto",
            composerPad && "pb-12"
          )}
        >
          {lines.map((line) => (
            <div
              key={line.id}
              className={cn(
                "flex flex-col gap-0.5",
                line.role === "user" && "items-end"
              )}
            >
              {line.imageUrl ? (
                <img
                  src={line.imageUrl}
                  alt=""
                  className="mt-0.5 max-h-40 w-auto max-w-[95%] rounded-lg border border-slate-100 object-contain"
                />
              ) : null}
              {line.text ? (
                <p
                  className={cn(
                    "max-w-[95%] text-[12px] leading-snug whitespace-pre-wrap break-words",
                    line.role === "user" &&
                      "rounded-lg bg-slate-50 px-2 py-1",
                    line.role === "ghost" && "font-medium"
                  )}
                >
                  {line.text}
                </p>
              ) : null}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {!lines.length && workMode === "care" ? (
          <div className="mt-2 flex shrink-0 flex-col gap-1">
            {CARE_ACTIONS.map((a) => (
              <button
                key={a.id}
                type="button"
                className="rounded-lg bg-slate-50 px-2 py-1.5 text-left text-[11px] font-medium text-[#24365c] hover:bg-slate-100"
                disabled={busy}
                onClick={() => onCare(a.id, a.prompt)}
              >
                {a.label}
              </button>
            ))}
            {t.talk.tasks.slice(0, 3).map((task) => (
              <button
                key={task}
                type="button"
                className="rounded-lg bg-slate-50 px-2 py-1.5 text-left text-[11px] font-medium text-[#24365c] hover:bg-slate-100"
                disabled={busy}
                onClick={() => void sendChat(task)}
              >
                {task}
              </button>
            ))}
          </div>
        ) : null}

        {workMode === "agent" && !lines.length ? (
          <p className="mt-2 rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] leading-snug text-slate-500">
            {lang === "ja"
              ? "おしごとモード。メニューから権限を変えられるよ。"
              : "Work mode. Change permissions from the menu."}
          </p>
        ) : null}

        {harness.pendingApproval ? (
          <div className="mt-2 space-y-2 rounded-xl border border-orange-200 bg-orange-50 p-2">
            <p className="text-[11px] font-semibold text-[#24365c]">
              しょうにんが必要
            </p>
            <p className="text-[10px] text-[#24365c]/70">
              {harness.pendingApproval.tool}
              {harness.pendingApproval.detail
                ? ` · ${harness.pendingApproval.detail}`
                : ""}
            </p>
            <div className="flex gap-1">
              <Button
                variant="care"
                size="sm"
                className="h-8 flex-1 text-xs"
                disabled={busy}
                onClick={() => void resolveApproval("allow")}
              >
                みとめる
              </Button>
              <Button
                variant="careSoft"
                size="sm"
                className="h-8 flex-1 text-xs"
                disabled={busy}
                onClick={() => void resolveApproval("deny")}
              >
                だめ
              </Button>
            </div>
          </div>
        ) : null}

        {micBlocked ? (
          <Button
            variant="careSoft"
            size="sm"
            className="mt-2 w-full text-xs"
            onClick={() => void window.petassist?.openMicSettings?.()}
          >
            マイク設定を開く
          </Button>
        ) : null}

        {attachments.length ? (
          <div
            className={cn(
              "mt-2 flex shrink-0 flex-wrap gap-1",
              composerPad && "pl-[5rem]"
            )}
          >
            {attachments.map((att) => (
              <button
                key={att.id}
                type="button"
                className="relative h-10 w-10 overflow-hidden rounded-lg bg-slate-100"
                title={att.name}
                onClick={() =>
                  setAttachments((prev) => prev.filter((row) => row.id !== att.id))
                }
              >
                <img
                  src={att.dataUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        ) : null}

        <div
          className={cn(
            "relative mt-2 shrink-0",
            composerPad && "pl-[5rem]"
          )}
        >
          <div className="mb-1 flex items-center gap-1">
            <button
              type="button"
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-[16px] font-light leading-none",
                plusOpen
                  ? "bg-[#24365c] text-white"
                  : "bg-slate-100 text-[#24365c]"
              )}
              aria-label={t.talk.attach}
              onClick={() => {
                setPlusOpen((open) => !open);
                setModeOpen(false);
              }}
            >
              +
            </button>
            <div className="relative">
              <button
                type="button"
                className={cn(
                  "flex h-7 max-w-[7.5rem] items-center gap-0.5 rounded-full px-2 text-[10px] font-semibold",
                  workMode === "agent"
                    ? "bg-slate-100 text-[#24365c]"
                    : "bg-[#24365c] text-white"
                )}
                aria-expanded={modeOpen}
                aria-label={t.talk.mode}
                onClick={() => {
                  setModeOpen((open) => !open);
                  setPlusOpen(false);
                }}
              >
                <span className="truncate">{modeLabel}</span>
                <span className="text-[8px] opacity-70">▾</span>
              </button>
              {modeOpen ? (
                <div className="absolute bottom-full left-0 z-20 mb-1 min-w-[8.5rem] rounded-xl bg-white p-1 shadow-lg ring-1 ring-slate-200">
                  {(
                    [
                      ["care", modeLabel],
                      ["agent", t.talk.modes.agent],
                      ["image", t.talk.modes.image],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-slate-50",
                        workMode === id &&
                          "bg-slate-50 font-semibold text-[#24365c]"
                      )}
                      onClick={() => {
                        setWorkMode(id);
                        setModeOpen(false);
                      }}
                    >
                      {id === "image" ? (
                        <span className="text-[10px]" aria-hidden>
                          ✎
                        </span>
                      ) : null}
                      {id === "care"
                        ? lang === "ja"
                          ? "おはなし"
                          : "Talk"
                        : label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full",
                !muted
                  ? "bg-rose-500 text-white"
                  : "bg-slate-100 text-slate-500",
                listening && "animate-pulse"
              )}
              aria-pressed={!muted}
              aria-label={t.talk.voice}
              title={t.talk.voice}
              onClick={() => {
                if (muted) void beginMic();
                else setMuted(true);
              }}
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
                <path
                  d="M8 1.5a2 2 0 0 0-2 2v4a2 2 0 1 0 4 0v-4a2 2 0 0 0-2-2Zm-4.5 6a.75.75 0 0 1 1.5 0 3 3 0 0 0 6 0 .75.75 0 0 1 1.5 0 4.5 4.5 0 0 1-3.75 4.435V14h1.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5h1.5v-2.065A4.5 4.5 0 0 1 3.5 7.5Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
          {plusOpen ? (
            <div className="absolute bottom-full left-0 z-20 mb-1 min-w-[9.5rem] rounded-xl bg-white p-1 shadow-lg ring-1 ring-slate-200">
              <button
                type="button"
                className="block w-full rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-slate-50"
                onClick={() => {
                  setPlusOpen(false);
                  photoRef.current?.click();
                }}
              >
                {t.talk.attachPhoto}
              </button>
            </div>
          ) : null}
        </div>

        <form
          className={cn(
            "mt-0 flex shrink-0 items-end gap-1",
            composerPad && "pl-[5rem]"
          )}
          onSubmit={(e) => {
            e.preventDefault();
            const text = draft.trim();
            if (!canSend) return;
            setDraft("");
            void sendChat(text);
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!canSend) return;
                const text = draft.trim();
                setDraft("");
                void sendChat(text);
              }
            }}
            placeholder={listening ? t.talk.listening : modeHint}
            rows={3}
            wrap="soft"
            disabled={busy || drawing}
            className="h-[4.25rem] min-w-0 flex-1 resize-none overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] leading-5 whitespace-pre-wrap outline-none focus:border-slate-400 disabled:opacity-60"
          />
          <Button
            type="submit"
            size="sm"
            className="h-8 px-2 text-xs"
            disabled={!canSend}
          >
            {drawing ? "…" : t.talk.send}
          </Button>
        </form>
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const reader = new FileReader();
            reader.onloadend = () => {
              const dataUrl =
                typeof reader.result === "string" ? reader.result : null;
              if (!dataUrl) return;
              setAttachments([
                {
                  id: `att-${Date.now()}`,
                  name: file.name,
                  dataUrl,
                },
              ]);
            };
            reader.readAsDataURL(file);
          }}
        />
      </div>
    );

  const shellClass = cn(
    embedded
      ? "relative flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-[#24365c]"
      : sticky
        ? "relative h-full w-full overflow-hidden bg-transparent text-[#24365c]"
        : "relative min-h-[100dvh] bg-[#f5f8ff] text-[#24365c] sm:min-h-0"
  );

  return (
    <div className={shellClass}>
      {!started && !embedded && !sticky && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#f5f8ff]/95 p-6">
          <Button
            variant="care"
            size="care"
            className="max-w-sm"
            onClick={beginMic}
          >
            はじめる
          </Button>
        </div>
      )}

      {sticky ? (
        <>
          {dockOpen ? (
            <div className="absolute inset-0 z-0 overflow-hidden p-1.5">
              <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[1.25rem] border border-white/55 bg-[rgba(255,255,255,0.96)] shadow-[0_12px_32px_rgba(20,50,120,0.14)]">
                {dockBody}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            className={cn(
              "absolute z-10 cursor-grab bg-transparent p-0 active:cursor-grabbing",
              dockOpen
                ? "bottom-1.5 left-0.5"
                : "inset-0 flex items-center justify-center"
            )}
            onPointerDown={onSpritePointerDown}
            aria-label={dockOpen ? "ドックをとじる" : "ドックをひらく"}
          >
            {sprite}
          </button>
        </>
      ) : (
        <div
          className={cn(
            "mx-auto flex h-full w-full max-w-lg flex-col",
            embedded ? "p-3" : "px-4 pb-8 pt-6"
          )}
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2" aria-label={GHOST.nameJa}>
              <GhostSprite
                status={status}
                moveDir={lookDir}
                loading={loading}
                mouthOpen={mouthOpen}
                eyeTick={eyeTick}
                floatAmp={floatAmp}
                floatSpeed={floatSpeed}
                sizeClassName="h-40 w-auto max-w-[11rem] sm:h-36"
                className={cn(
                  status === "failed" && "opacity-90",
                  status === "talking" &&
                    "drop-shadow-[0_0_12px_rgba(43,125,255,0.45)]"
                )}
              />
            </div>
            {listening ? (
              <span
                className="mt-2 h-2.5 w-2.5 animate-pulse rounded-full bg-[#2b7dff]"
                aria-hidden
              />
            ) : null}
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.25rem] border border-white/55 bg-[rgba(255,255,255,0.94)] shadow-[0_18px_48px_rgba(20,50,120,0.14)] backdrop-blur-[10px]">
            {dockBody}
          </div>
        </div>
      )}
    </div>
  );
});
