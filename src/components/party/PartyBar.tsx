"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PartySlot } from "@/components/party/PartySlot";
import type { PartyMember } from "@/data/party";
import { cn } from "@/lib/utils";

type PartyBarProps = {
  party: PartyMember[];
  selectedId?: string | null;
  pinnedIds?: string[];
  tearOff?: boolean;
  onSelect?: (id: string) => void;
  onChat?: (id: string) => void;
  onMenuOpen?: (id: string) => boolean | void;
  onReorder?: (fromId: string, toId: string) => void;
  talkingId?: string | null;
  hiddenIds?: string[];
  awayIds?: string[];
  transparent?: boolean;
  compact?: boolean;
  /** Frosted dock chrome. Defaults to open. */
  shellOpen?: boolean;
  onShellOpenChange?: (open: boolean) => void;
  className?: string;
};

export function PartyBar({
  party,
  selectedId,
  pinnedIds,
  tearOff,
  onSelect,
  onChat,
  onMenuOpen,
  onReorder,
  talkingId,
  hiddenIds,
  awayIds,
  transparent,
  compact,
  shellOpen,
  onShellOpenChange,
  className,
}: PartyBarProps) {
  const [overId, setOverId] = useState<string | null>(null);
  const [localOpen, setLocalOpen] = useState(true);
  const open = shellOpen ?? localOpen;
  const setOpen = (next: boolean) => {
    onShellOpenChange?.(next);
    if (shellOpen === undefined) setLocalOpen(next);
  };

  const showShell = open && !transparent;

  return (
    <div
      className={cn(
        "relative z-20 overflow-visible px-1 pb-2 pt-8",
        className
      )}
    >
      <AnimatePresence initial={false}>
        {showShell ? (
          <motion.div
            key="dock-shell"
            className="absolute inset-0 z-0 rounded-2xl border border-white/60 bg-white/80 shadow-lg backdrop-blur-md"
            initial={{ opacity: 0, scale: 0.72, y: 28 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.82, y: 18 }}
            transition={{
              type: "spring",
              stiffness: 380,
              damping: 26,
              mass: 0.7,
            }}
            style={{ transformOrigin: "50% 100%" }}
            aria-hidden
          />
        ) : null}
      </AnimatePresence>

      <div className="relative z-10 flex items-end justify-center gap-0.5">
        {party.map((m) => (
          <div
            key={m.id}
            draggable={Boolean(onReorder)}
            onDragStart={(e) => {
              const fromSprite = (e.target as HTMLElement | null)?.closest?.(
                "[data-pet-sprite]"
              );
              if (fromSprite) {
                e.preventDefault();
                return;
              }
              e.dataTransfer.setData("text/pet-id", m.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (!onReorder) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOverId(m.id);
            }}
            onDragLeave={() => {
              setOverId((id) => (id === m.id ? null : id));
            }}
            onDrop={(e) => {
              e.preventDefault();
              setOverId(null);
              const fromId = e.dataTransfer.getData("text/pet-id");
              if (fromId) onReorder?.(fromId, m.id);
            }}
            onDragEnd={() => setOverId(null)}
            className={cn(
              "rounded-2xl transition",
              overId === m.id && "ring-2 ring-pink-200"
            )}
          >
            <PartySlot
              member={m}
              selected={selectedId === m.id}
              compact={compact}
              pinned={pinnedIds?.includes(m.id)}
              hidden={hiddenIds?.includes(m.id)}
              away={awayIds?.includes(m.id)}
              tearOff={tearOff}
              suppressBubble={talkingId === m.id || !open}
              onSelect={onSelect}
              onChat={(id) => {
                // Click ghost: close dock / reopen from behind. Same place & size.
                if (open) {
                  setOpen(false);
                  return;
                }
                setOpen(true);
                onChat?.(id);
              }}
              onMenuOpen={onMenuOpen}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
