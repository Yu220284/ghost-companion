"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { GhostDeskApp } from "@/components/ghost/GhostDeskApp";

function StickyGhost() {
  const params = useSearchParams();
  const id = params.get("id") ?? "ghost";
  // Ghost Companion is Obake-only; sticky chrome is the layered dock UI.
  void id;
  return <GhostDeskApp sticky />;
}

export default function PetPage() {
  return (
    <Suspense>
      <StickyGhost />
    </Suspense>
  );
}
