# `/app-link` — what the cloud gateway owes the phone

Read from `kaustav991a/J.A.R.V.I.S`, branch `feat/cloud-gateway`, file
`jarvis-backend/cloud_gateway.py` (978 lines), on 2026-08-11.

The gateway already runs a WebSocket server: `/desk-link`, where the desk dials
in to become the front door's brain. `/app-link` is a second door onto the same
machinery — the phone dialling in as a *client* rather than a brain.

## Why it cannot just reuse `/desk-link`

|                | `/desk-link` (exists)                | `/app-link` (needed)                     |
| -------------- | ------------------------------------ | ---------------------------------------- |
| Auth           | `X-Bridge-Secret` header             | `?token=` query param                    |
| Client sends   | JSON `{"type": "cmd", …}`            | a bare command string, no envelope       |
| Client expects | JSON `{"type": "reply", …}`          | frames keyed `kind` — see `src/ws/frames.ts` |

React Native's `WebSocket` cannot set request headers on the handshake, which
is why the mobile client authenticates with a query parameter. And
`LinkMachine.send()` writes the command text straight to the socket:

```ts
send(text: string): boolean {
  if (!this.socket || this.snap.status !== 'open') return false;
  this.socket.send(text);   // no JSON wrapper
```

## Two changes on the gateway

### 1. Declare the capability in `/health`

The app refuses a gateway that does not say it serves this socket. A 200 alone
would flip the phone to CLOUD and strand it on a dead connection — worse than
staying dark. So add the flag **only once the route below actually works**:

```python
return {"status": "ok", "service": "jarvis-cloud-gateway",
        "mode": MODE, "identities": roster,
        "app_link": True,          # <- the phone reads exactly this
        "bridge": bool(BRIDGE_SECRET),
        "desk_linked": _desk_connected(),
        ...}
```

### 2. The route

Uses names already in `cloud_gateway.py`: `_IDENTITIES`, `_desk_connected()`,
`think()`, `BRIDGE_SECRET`.

```python
# Same secret as the bridge unless you want a separate one for phones.
APP_TOKEN = (os.getenv("APP_TOKEN") or BRIDGE_SECRET or "").strip()


@app.websocket("/app-link")
async def app_link(websocket: WebSocket):
    """The phone dials in here. It speaks bare text and reads `kind` frames."""
    if not APP_TOKEN:
        await websocket.close(code=1008)
        return
    presented = websocket.query_params.get("token", "")
    if not hmac.compare_digest(presented, APP_TOKEN):
        peer = websocket.client.host if websocket.client else "?"
        print(f"[CLOUD] app-link token mismatch from {peer}", flush=True)
        await websocket.close(code=1008)
        return

    await websocket.accept()
    ident = next(iter(_IDENTITIES.values()),
                 {"who": "KAUSTAV", "honorific": "Sir", "tier": "admin"})
    who = (ident.get("who") or "KAUSTAV").upper()

    async def say(status: str, message: str = "") -> None:
        await websocket.send_json({"kind": "status", "status": status,
                                   "message": message, "user": who})

    await say("online", "Desk reachable through the cloud."
                        if _desk_connected() else "Cloud brain only — the desk is off.")
    try:
        while True:
            text = (await websocket.receive_text()).strip()
            if not text:
                continue
            await say("thinking")
            try:
                # chat_id 0: this conversation is not a Telegram chat. `think`
                # keys its rolling memory off it, so the phone gets its own.
                reply = await think(0, text, ident["who"], ident["honorific"])
            except Exception as e:  # noqa: BLE001
                await say("error", f"Could not answer that: {e}")
                continue
            await say("speaking", reply)
            await say("online")
    except WebSocketDisconnect:
        print("[CLOUD] app-link closed", flush=True)
```

## What that gets you, and what it does not

Working immediately: the phone finds the gateway, connects, and every command
is answered by the cloud brain. Chat, lookups, questions. The HUD reads
`speaking` and shows the reply.

**Not** working: PC control. `_forward_to_desk()` is Telegram-shaped — it takes
an aiogram `message` and relays the desk's reply back to Telegram rather than
returning it. Routing phone commands to a linked desk needs that function split
into "send and await the reply text" and "post it to Telegram". Worth doing,
but it is a refactor of live code, not an addition, so do it after `/app-link`
proves out.

Also absent: telemetry. The cloud has no CPU or disk figures for your desk, so
the Reports tab stays empty in cloud mode — correct, since those are the desk's
numbers and the desk is off. Do not synthesise them.

## The phone side is already done

`chooseMode()` probes the desk, then the cloud, then goes dark, and re-probes
every 5s while dead, on foreground, and on any network change. The transport
pill shows **CLOUD in gold** deliberately: a cloud session holds no PC-control
powers and must never be read as a full desk link.

Set on the phone, in `.env.local` (already done):

```
EXPO_PUBLIC_JARVIS_CLOUD=https://jarvis-cloud-gateway.onrender.com
```

Still owed on the phone: nothing writes the pairing token. `saveToken`/
`loadToken` exist and `useLink` reads one, but no screen sets it, so the
`?token=` above will be absent until the pairing work in `ROADMAP.md` §1 lands.
Until then, either leave `APP_TOKEN` unset and gate the route some other way, or
finish pairing first — do not ship an ungated `/app-link`, since it reaches a
brain that can answer as you.
