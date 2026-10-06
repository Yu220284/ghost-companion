"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { PairSheet } from "@/components/companion/PairSheet";
import { BrandLogo } from "@/components/brand/BrandLogo";
import {
  GhostDeskApp,
  type GhostDeskHandle,
} from "@/components/ghost/GhostDeskApp";
import { INITIAL_PARTY, type PartyMember } from "@/data/party";
import {
  CompanionProvider,
  useCompanion,
} from "@/lib/hooks/use-companion";
import { subscribeOpenPairSheet } from "@/lib/companion/client";

/**
 * Desk: care talk + phone pairing. Single Obake — no party dock strip.
 */
export function GhostDeskConsole() {
  const [party] = useState<PartyMember[]>(INITIAL_PARTY);
  const ghostRef = useRef<GhostDeskHandle>(null);
  const seenPocket = useRef(new Set<string>());

  return (
    <CompanionProvider
      party={party}
      onPocketMessage={(line, _thread, meta) => {
        if (line.from !== "phone") return;
        if (seenPocket.current.has(line.msgId)) return;
        seenPocket.current.add(line.msgId);
        void window.petassist?.notify?.({
          title: "おばけちゃん",
          body: line.text.slice(0, 180),
        });
        if (meta?.leapTo === "pc") {
          void window.petassist?.resizeSticky?.(line.petId, "chat");
        }
        ghostRef.current?.ingestPhone(line.text);
      }}
      onLeap={(id, to) => {
        if (to === "phone") {
          void window.petassist?.resizeSticky?.(id, "compact");
        }
      }}
    >
      <GhostDeskInner ghostRef={ghostRef} />
    </CompanionProvider>
  );
}

function GhostDeskInner({
  ghostRef,
}: {
  ghostRef: RefObject<GhostDeskHandle | null>;
}) {
  const companion = useCompanion();

  useEffect(() => {
    return subscribeOpenPairSheet(() => {
      void window.petassist?.showDock();
      void companion?.openPairSheet();
    });
  }, [companion]);

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-[#f5f8ff] text-[#24365c]">
      <PairSheet />
      <header className="relative z-40 flex items-center px-5 py-4">
        <BrandLogo height={26} />
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-8">
        <div className="min-h-0 flex-1 overflow-hidden rounded-[1.25rem] border border-white/55 bg-[rgba(255,255,255,0.94)] shadow-[0_18px_48px_rgba(20,50,120,0.14)] backdrop-blur-[10px]">
          <GhostDeskApp ref={ghostRef} embedded />
        </div>
      </main>
    </div>
  );
}
