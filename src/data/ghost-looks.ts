import type { GhostStatus } from "@/data/ghost";

/** Ghost-only sprites. Not derived from Petassist animal coats. */
export const GHOST_SPRITES = {
  normal: "/ghost/normal.png",
  failed: "/ghost/failed.png",
} as const;

export function spriteForGhost(status: GhostStatus): string {
  if (status === "failed") return GHOST_SPRITES.failed;
  return GHOST_SPRITES.normal;
}
