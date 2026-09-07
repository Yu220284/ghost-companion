export type GhostStatus = "idle" | "talking" | "failed";

export type GhostCompanion = {
  id: "ghost";
  name: "Ghost";
  nameJa: "お化け";
  tagline: "ふわっと、そばに。";
  taglineEn: "Floating, softly, by your side.";
  accent: string;
  status: GhostStatus;
};

export const GHOST: GhostCompanion = {
  id: "ghost",
  name: "Ghost",
  nameJa: "お化け",
  tagline: "ふわっと、そばに。",
  taglineEn: "Floating, softly, by your side.",
  accent: "#c6a661",
  status: "idle",
};

export const GHOST_BUBBLES: Record<GhostStatus, string[]> = {
  idle: [
    "今日もそばにいるよ。",
    "ふわふわ……。",
    "なにかあったら話しかけてね。",
  ],
  talking: [
    "うんうん。",
    "聞いてるよ。",
    "もうすこし教えて？",
  ],
  failed: [
    "うまくできなかった……。",
    "ごめんね。もういちど試そう。",
    "ちょっと落ち込み中……。",
  ],
};
