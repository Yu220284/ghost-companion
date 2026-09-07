import { NextResponse } from "next/server";
import { GHOST_BUBBLES } from "@/data/ghost";

type Body = {
  message?: string;
  lang?: "ja" | "en";
  history?: { role: string; text: string }[];
};

const FALLBACK_JA = [
  "ふわっとそばにいるよ。",
  "うん、きいてるよ。",
  "だいじょうぶ。ゆっくりでいいよ。",
  "きょうもいっしょにいよう。",
];

const FALLBACK_EN = [
  "I’m floating right here with you.",
  "Mm-hm, I’m listening.",
  "It’s okay. Take your time.",
  "Let’s stay together today.",
];

function ruleReply(message: string, lang: "ja" | "en"): string {
  const m = message.toLowerCase();
  if (/悲し|つらい|lonely|sad|alone/.test(m)) {
    return lang === "ja"
      ? "そばにいるよ。ひとりじゃないよ。"
      : "I’m here. You’re not alone.";
  }
  if (/おはよう|good morning/.test(m)) {
    return lang === "ja" ? "おはよう。きょうもふわふわしよう。" : "Good morning. Soft day ahead.";
  }
  if (/おやすみ|good night/.test(m)) {
    return lang === "ja" ? "おやすみ。やさしいゆめを。" : "Good night. Soft dreams.";
  }
  if (/ありがとう|thanks|thank you/.test(m)) {
    return lang === "ja" ? "どういたしまして。また話しかけてね。" : "Anytime. Talk to me again.";
  }
  const pool = lang === "ja" ? FALLBACK_JA : FALLBACK_EN;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function llmReply(message: string, lang: "ja" | "en"): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const base = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const system =
    lang === "ja"
      ? "あなたは部屋の空中にいるかわいいお化けの対話コンパニオン。短くやさしく日本語で答える。操縦やモーターの話はしない。見守りと寄り添いに徹する。"
      : "You are a cute floating ghost dialogue companion. Reply briefly and kindly. Never discuss motors or robot piloting. Focus on companionship and watching over.";

  const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: message },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() || null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const message = (body.message ?? "").trim();
    const lang = body.lang === "en" ? "en" : "ja";
    if (!message) {
      return NextResponse.json(
        { failed: true, reply: GHOST_BUBBLES.failed[0] },
        { status: 400 }
      );
    }
    const fromLlm = await llmReply(message, lang);
    const reply = fromLlm ?? ruleReply(message, lang);
    return NextResponse.json({ reply, failed: false });
  } catch {
    return NextResponse.json(
      {
        failed: true,
        reply: GHOST_BUBBLES.failed[1],
      },
      { status: 500 }
    );
  }
}
