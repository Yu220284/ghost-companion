"use client";

import type { CSSProperties } from "react";
import {
  spriteForGhostLook,
  type MoveDir,
} from "@/data/ghost-looks";
import type { GhostStatus } from "@/data/ghost";
import { cn } from "@/lib/utils";

type GhostSpriteProps = {
  status: GhostStatus;
  moveDir?: MoveDir;
  loading?: boolean;
  mouthOpen?: boolean;
  eyeTick?: number;
  className?: string;
  /** Default fills sticky: tall Obake art is ~1:2 */
  sizeClassName?: string;
  floatAmp?: number;
  floatSpeed?: number;
  /** Pause CSS bob (e.g. while dragging). */
  paused?: boolean;
  /** Optional CSS drift (non-sticky wander). */
  shiftX?: number;
  shiftY?: number;
};

export function GhostSprite({
  status,
  moveDir = null,
  loading = false,
  mouthOpen = false,
  eyeTick = 0,
  className,
  sizeClassName = "h-full w-auto max-w-full",
  floatAmp = 6,
  floatSpeed = 4.2,
  paused = false,
  shiftX = 0,
  shiftY = 0,
}: GhostSpriteProps) {
  const src = spriteForGhostLook({
    status,
    moveDir,
    loading,
    mouthOpen,
    eyeTick,
  });

  return (
    <img
      src={src}
      alt=""
      draggable={false}
      style={
        {
          "--ghost-float-amp": `${floatAmp}px`,
          "--ghost-float-dur": `${floatSpeed}s`,
          ...(shiftX || shiftY
            ? { translate: `${shiftX}px ${shiftY}px` }
            : null),
        } as CSSProperties
      }
      className={cn(
        "pointer-events-none object-contain select-none ghost-float",
        paused && "ghost-float-paused",
        sizeClassName,
        className
      )}
    />
  );
}
