"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { GHOST, GHOST_BUBBLES, type GhostStatus } from "@/data/ghost";
import { spriteForGhost } from "@/data/ghost-looks";
import { cn } from "@/lib/utils";

type Tab = "home" | "chat" | "watch" | "settings";
type ChatRole = "user" | "ghost";
type ChatLine = { id: string; role: ChatRole; text: string };

function speechCtor() {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function GhostCompanionApp() {
  const [tab, setTab] = useState<Tab>("home");
  const [status, setStatus] = useState<GhostStatus>("idle");
  const [lang, setLang] = useState<"ja" | "en">("ja");
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [snapUrl, setSnapUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recogRef = useRef<SpeechRecognition | null>(null);

  const bubble = useMemo(() => {
    const list = GHOST_BUBBLES[status];
    return list[Math.floor(Date.now() / 8000) % list.length];
  }, [status]);

  const sprite = spriteForGhost(status);
  const tagline = lang === "ja" ? GHOST.tagline : GHOST.taglineEn;
  const name = lang === "ja" ? GHOST.nameJa : GHOST.name;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, busy]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      recogRef.current?.stop();
    };
  }, []);

  const startCamera = useCallback(async () => {
    setCamError(null);
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCamError(
        lang === "ja"
          ? "カメラを開けませんでした。ブラウザの許可を確認してね。"
          : "Could not open the camera. Check browser permissions."
      );
      setStatus("failed");
    }
  }, [lang]);

  useEffect(() => {
    if (tab === "watch") void startCamera();
    else {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [tab, startCamera]);

  const takeSnap = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setSnapUrl(canvas.toDataURL("image/jpeg", 0.86));
  };

  const sendChat = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const userLine: ChatLine = {
      id: `u-${Date.now()}`,
      role: "user",
      text: trimmed,
    };
    setLines((prev) => [...prev, userLine]);
    setDraft("");
    setBusy(true);
    setStatus("talking");
    try {
      const res = await fetch("/api/ghost/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, lang, history: lines.slice(-8) }),
      });
      const data = (await res.json()) as { reply?: string; failed?: boolean };
      if (!res.ok || data.failed) {
        setStatus("failed");
        setLines((prev) => [
          ...prev,
          {
            id: `g-${Date.now()}`,
            role: "ghost",
            text:
              data.reply ??
              (lang === "ja"
                ? "うまく答えられなかった……。もういちど試してね。"
                : "I couldn't answer that… try again?"),
          },
        ]);
      } else {
        setStatus("idle");
        setLines((prev) => [
          ...prev,
          {
            id: `g-${Date.now()}`,
            role: "ghost",
            text: data.reply ?? (lang === "ja" ? "うん。" : "Okay."),
          },
        ]);
      }
    } catch {
      setStatus("failed");
      setLines((prev) => [
        ...prev,
        {
          id: `g-${Date.now()}`,
          role: "ghost",
          text:
            lang === "ja"
              ? "通信に失敗しちゃった……。"
              : "Something went wrong on the line…",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendChat(draft);
  };

  const toggleMic = () => {
    const Ctor = speechCtor();
    if (!Ctor) {
      setStatus("failed");
      return;
    }
    if (listening && recogRef.current) {
      recogRef.current.stop();
      setListening(false);
      return;
    }
    const recog = new Ctor();
    recogRef.current = recog;
    recog.lang = lang === "ja" ? "ja-JP" : "en-US";
    recog.interimResults = false;
    recog.onresult = (ev: SpeechRecognitionEvent) => {
      const text = ev.results[0]?.[0]?.transcript ?? "";
      if (text) void sendChat(text);
    };
    recog.onerror = () => {
      setListening(false);
      setStatus("failed");
    };
    recog.onend = () => setListening(false);
    setListening(true);
    recog.start();
  };

  return (
    <div className="ghost-app min-h-[100dvh] bg-[#050812] text-[#f5f0e6]">
      <header className="sticky top-0 z-20 border-b border-[rgba(198,166,97,0.22)] bg-[rgba(5,8,18,0.92)] px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.16em] text-[#c6a661] uppercase">
              100bas · companion
            </p>
            <h1 className="font-semibold tracking-wide text-[#f5f0e6]">
              {name}
            </h1>
          </div>
          <p className="max-w-[10rem] text-right text-xs text-[#b4bed2]">
            {tagline}
          </p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-col px-4 pb-28 pt-5">
        {tab === "home" && (
          <section className="flex flex-col items-center text-center">
            <motion.div
              className="relative mt-4"
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sprite}
                alt={name}
                className="h-52 w-52 object-contain drop-shadow-[0_0_28px_rgba(198,166,97,0.28)]"
              />
            </motion.div>
            <p className="mt-5 rounded-2xl border border-[rgba(198,166,97,0.35)] bg-[rgba(10,16,40,0.72)] px-4 py-2 text-sm text-[#f5f0e6]">
              {bubble}
            </p>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-[#b4bed2]">
              {lang === "ja"
                ? "見守りとおしゃべりのための対話コンパニオン。実機の操作は別のソフトウェアです。"
                : "A dialogue companion for watching over and chatting. Robot control lives in a separate app."}
            </p>
            <div className="mt-8 flex w-full gap-3">
              <Button
                className="flex-1 bg-[#c6a661] text-[#120e08] hover:bg-[#d4b56f]"
                onClick={() => setTab("chat")}
              >
                {lang === "ja" ? "はなす" : "Chat"}
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-[rgba(198,166,97,0.45)] bg-transparent text-[#f5f0e6]"
                onClick={() => setTab("watch")}
              >
                {lang === "ja" ? "みまもり" : "Watch"}
              </Button>
            </div>
          </section>
        )}

        {tab === "chat" && (
          <section className="flex min-h-[70dvh] flex-col">
            <div className="mb-4 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sprite} alt="" className="h-14 w-14 object-contain" />
              <div>
                <p className="text-sm font-medium">{name}</p>
                <p className="text-xs text-[#b4bed2]">
                  {status === "failed"
                    ? lang === "ja"
                      ? "すこし元気がないみたい"
                      : "Feeling a bit down"
                    : lang === "ja"
                      ? "きいてるよ"
                      : "Listening"}
                </p>
              </div>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-[rgba(198,166,97,0.2)] bg-[rgba(10,16,40,0.55)] p-3">
              {lines.length === 0 && (
                <p className="text-sm text-[#b4bed2]">
                  {lang === "ja"
                    ? "なんでも話してね。そばにいるよ。"
                    : "Say anything. I’m right here."}
                </p>
              )}
              {lines.map((line) => (
                <div
                  key={line.id}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                    line.role === "user"
                      ? "ml-auto bg-[#c6a661] text-[#120e08]"
                      : "bg-[rgba(245,240,230,0.08)] text-[#f5f0e6]"
                  )}
                >
                  {line.text}
                </div>
              ))}
              {busy && (
                <p className="text-xs text-[#b4bed2]">
                  {lang === "ja" ? "考え中……" : "Thinking…"}
                </p>
              )}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={onSubmit} className="mt-3 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  lang === "ja" ? "メッセージを書く" : "Write a message"
                }
                className="min-w-0 flex-1 rounded-xl border border-[rgba(198,166,97,0.35)] bg-[#0a1028] px-3 py-2.5 text-sm text-[#f5f0e6] outline-none placeholder:text-[#6b758a] focus:border-[#c6a661]"
              />
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "border-[rgba(198,166,97,0.45)] bg-transparent px-3 text-[#f5f0e6]",
                  listening && "border-[#c6a661] text-[#c6a661]"
                )}
                onClick={toggleMic}
                aria-label="mic"
              >
                {listening ? "…" : "mic"}
              </Button>
              <Button
                type="submit"
                disabled={busy || !draft.trim()}
                className="bg-[#c6a661] text-[#120e08] hover:bg-[#d4b56f]"
              >
                {lang === "ja" ? "送る" : "Send"}
              </Button>
            </form>
          </section>
        )}

        {tab === "watch" && (
          <section className="flex flex-col gap-4">
            <p className="text-sm text-[#b4bed2]">
              {lang === "ja"
                ? "この端末のカメラで、いまの様子を見るよ（実機カメラ連携ではない）。"
                : "Preview this device’s camera (not the robot’s onboard camera)."}
            </p>
            <div className="overflow-hidden rounded-2xl border border-[rgba(198,166,97,0.28)] bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                className="aspect-[3/4] w-full object-cover"
              />
            </div>
            {camError && (
              <p className="text-sm text-[#f0a0a0]">{camError}</p>
            )}
            <div className="flex gap-3">
              <Button
                className="flex-1 bg-[#c6a661] text-[#120e08] hover:bg-[#d4b56f]"
                onClick={takeSnap}
              >
                {lang === "ja" ? "スナップ" : "Snap"}
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-[rgba(198,166,97,0.45)] bg-transparent text-[#f5f0e6]"
                onClick={() => void startCamera()}
              >
                {lang === "ja" ? "再接続" : "Retry"}
              </Button>
            </div>
            {snapUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={snapUrl}
                alt="snap"
                className="rounded-xl border border-[rgba(198,166,97,0.25)]"
              />
            )}
          </section>
        )}

        {tab === "settings" && (
          <section className="space-y-5">
            <div>
              <p className="mb-2 text-xs tracking-wide text-[#c6a661]">
                Language
              </p>
              <div className="flex gap-2">
                <Button
                  className={cn(
                    "flex-1",
                    lang === "ja"
                      ? "bg-[#c6a661] text-[#120e08]"
                      : "border border-[rgba(198,166,97,0.45)] bg-transparent text-[#f5f0e6]"
                  )}
                  variant={lang === "ja" ? "default" : "outline"}
                  onClick={() => setLang("ja")}
                >
                  JA
                </Button>
                <Button
                  className={cn(
                    "flex-1",
                    lang === "en"
                      ? "bg-[#c6a661] text-[#120e08]"
                      : "border border-[rgba(198,166,97,0.45)] bg-transparent text-[#f5f0e6]"
                  )}
                  variant={lang === "en" ? "default" : "outline"}
                  onClick={() => setLang("en")}
                >
                  EN
                </Button>
              </div>
            </div>
            <div className="rounded-2xl border border-[rgba(198,166,97,0.28)] bg-[rgba(10,16,40,0.55)] p-4 text-sm leading-relaxed text-[#b4bed2]">
              {lang === "ja" ? (
                <>
                  <p className="font-medium text-[#f5f0e6]">このアプリについて</p>
                  <p className="mt-2">
                    対話コンパニオン専用です。お化けロボットの移動や手の操作は、別の操作ソフトウェアで行います（Coming soon）。
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium text-[#f5f0e6]">About</p>
                  <p className="mt-2">
                    Dialogue companion only. Moving the ghost robot or its hands
                    belongs in a separate control app (coming soon).
                  </p>
                </>
              )}
            </div>
          </section>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[rgba(198,166,97,0.22)] bg-[rgba(5,8,18,0.94)] px-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md">
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
          {(
            [
              ["home", lang === "ja" ? "ホーム" : "Home"],
              ["chat", lang === "ja" ? "会話" : "Chat"],
              ["watch", lang === "ja" ? "見守り" : "Watch"],
              ["settings", lang === "ja" ? "設定" : "Settings"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "rounded-xl px-2 py-2.5 text-xs tracking-wide transition",
                tab === id
                  ? "bg-[rgba(198,166,97,0.18)] text-[#c6a661]"
                  : "text-[#b4bed2]"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
