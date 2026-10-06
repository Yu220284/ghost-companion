# Ghost Companion

Petassist desk + TrueForge agent harness, with Obake（お化けちゃん）as an added companion.

## What’s included (Petassist full stack)

- Desk (`/desk`) with party dock, TalkPanel, grants / L0–L3
- Electron sticky pets (`/pet?id=…`)
- Agent APIs + **TrueForge** (`src/lib/agent/trueforge.ts`, MCP, sandbox)
- Companion / pocket flows from Petassist
- Obake webp sprites + wake word **おばけちゃん** + care talk (`/api/ghost/chat`)

## Node

Electron 44 needs **Node >= 22.12**:

```bash
nvm use 22
```

## Run

```bash
# terminal 1 — Next
nvm use 22 && npm run dev

# terminal 2 — TrueForge (optional but recommended for agent jobs)
npx @truefoundry/trueforge

# terminal 3 — Electron desk
nvm use 22 && npm run electron
```

Or `npm run dev:desktop` for Next + Electron.

## Env

```bash
cp .env.example .env.local
```

Set `TRUEFORGE_BASE_URL` (default `http://127.0.0.1:8790`) and model in TrueForge Settings.

## Hardware (separate repo)

Physical Obake lives next door: [`../Obake_device`](../Obake_device) ([kazu-1234/Obake_device](https://github.com/kazu-1234/Obake_device)). Do not copy firmware into this tree.

This app stays a desk companion. Robot control is out of scope here. When we connect later, the device waits at `ws://obake.local:8765/ws/v1/robot` (see that repo’s 引き継ぎ.md §2.1). Wake word on both sides is **おばけちゃん**.

Desk hamburger **スマホとつなぐ** opens the Petassist LAN pair sheet (QR / 6-digit code → `/pocket`). Sticky menu can jump to the same sheet via the dock window.

## Assets

- Party coats: `public/party/{pet}/*.webp`
- Obake: `public/ghost/Obake*.webp`
