# SHADOW MESH — Complete Project Summary

---

## Problem Statement

> **Domain:** Defense · Disaster Response · Critical Infrastructure

In high-risk operational environments, teams rely on rapid sharing of multi-modal intelligence — text updates, images, and voice inputs. Existing communication systems expose sensitive data during transmission, making them vulnerable to interception, unauthorized access, and metadata leakage.

Even when encryption is used, intermediate systems (servers, relays, network layers) can still infer:
- **Who** is communicating
- **What type** of data is being shared
- **When and how often** communication occurs (pattern analysis)

Current systems also lack fine-grained access control and privacy-preserving auditability, forcing organizations to choose between data security and operational efficiency.

### Requirements
- Secure sharing of text, image, and voice data
- End-to-end encryption
- Anonymous communication
- Real-time or near-real-time messaging
- Privacy-preserving logs (activity tracking without content exposure)

### Good to Have
- Dynamic key exchange (secure session-based keys)
- Peer-to-peer communication (reduced central dependency)
- Ephemeral messages (auto-delete after use)
- Visualization dashboard (secure intel flow view)

---

## Our Solution — Shadow Mesh

**Shadow Mesh** is a secure, real-time multi-modal communication platform built for high-stakes operational environments. Every design decision — from onboarding to message delivery — is driven by one principle: **the server should never be trusted, because it is never given anything to trust.**

### Core Philosophy
- **Zero-trust architecture** — servers relay ciphertext they cannot decrypt
- **Anonymity by default** — no email, no phone, no real name at any point
- **Metadata minimization** — even traffic patterns are obfuscated
- **Privacy-preserving accountability** — audit logs that prove activity without revealing content

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT BROWSER                           │
│                                                                 │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │  Ed25519    │    │  X25519      │    │  AES-256-GCM     │   │
│  │  Identity   │───▶│  Key Exchange│───▶│  Encrypt/Decrypt │   │
│  │  Keypair    │    │  + HKDF      │    │  (browser-side)  │   │
│  └─────────────┘    └──────────────┘    └──────────────────┘   │
│         │                                        │              │
│  Pseudonymous ID                        Encrypted Blob          │
│  (never sent in plaintext)             (only this leaves)       │
└─────────────────────┬───────────────────────────┬───────────────┘
                      │ WebSocket (WSS)            │
                      ▼                            │
┌─────────────────────────────────┐               │
│         RELAY SERVER            │               │
│         (Port 3001)             │               │
│                                 │               │
│  Sees: Client IP + encrypted    │               │
│  blob                           │               │
│                                 │               │
│  Does: Strips IP, assigns       │               │
│  anonymous token, forwards      │               │
│                                 │               │
│  Does NOT see: Content,         │               │
│  recipient identity, media type │               │
└──────────────┬──────────────────┘               │
               │ WebSocket                         │
               ▼                                   │
┌─────────────────────────────────┐               │
│         GATEWAY SERVER          │               │
│         (Port 3002)             │               │
│                                 │               │
│  Sees: Encrypted blob +         │               │
│  recipient token                │               │
│                                 │               │
│  Does: Routes to recipient,     │               │
│  writes hashed audit log        │               │
│                                 │               │
│  Does NOT see: Sender IP,       │               │
│  content, real identities       │               │
│                                 │               │
│  Stores: Public keys only       │               │
│  SQLite: hashed IDs + actions   │               │
└─────────────────────────────────┘               │
                                                   │
                      ┌────────────────────────────┘
                      │ WebSocket
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                     RECIPIENT BROWSER                           │
│                  (Decrypts locally, no server involved)         │
└─────────────────────────────────────────────────────────────────┘
```

### Why Two Servers?

This is a simplified **OHTTP (Oblivious HTTP)** pattern:

| Server | Knows | Does NOT Know |
|--------|-------|---------------|
| Relay | Client's real IP | Message content, recipient |
| Gateway | Message (ciphertext) + recipient token | Sender's real IP |

Neither server alone can link a real identity to a message. Both would need to be simultaneously compromised and collude to de-anonymize traffic.

---

## Cryptographic Stack

| Layer | Algorithm | Purpose |
|-------|-----------|---------|
| Identity Keys | **Ed25519** | Signing and identity verification |
| Key Exchange | **X25519 (ECDH)** | Derive shared secret between two parties |
| Key Derivation | **HKDF-SHA256** | Stretch shared secret into AES session key |
| Encryption | **AES-256-GCM** | Encrypt all payloads (text, image, voice) |
| Integrity | **HMAC-SHA256** | Audit commitment — proves message sent without revealing content |
| Hashing | **SHA-256** | Hash all IDs in audit log — irreversible |

### Key Exchange Flow
```
Alice has:  her X25519 secret key + Bob's X25519 public key
Bob has:    his X25519 secret key + Alice's X25519 public key

Alice: sharedSecret = X25519(alice_sk, bob_pk)
Bob:   sharedSecret = X25519(bob_sk, alice_pk)
                    ↕ (mathematically identical — no server involved)

Both derive: sessionKey = HKDF(sharedSecret, "shadow-mesh-v1:channelId")
```
The session key is computed **entirely on-device**. It never touches the network.

---

## Privacy Mechanisms

### 1. Pseudonymous Identity
- No registration with email, phone, or real name
- Device generates a random 12-character callsign (e.g., `ALPHA7XKR9P2`)
- Ed25519 + X25519 keypairs generated locally in the browser
- Private keys stored in localStorage — **never transmitted**

### 2. Sealed Sender
- Sender's identity is encrypted **inside** the ciphertext
- The relay and gateway only see the recipient's anonymous token on the outer envelope
- Even the server cannot tell who sent a message to whom

### 3. Packet Normalization (Traffic Analysis Resistance)
All content is padded to fixed bucket sizes before encryption:

| Content | Before | After encryption |
|---------|--------|-----------------|
| Short text "Hello" | 5 bytes | Padded to 1,024 bytes |
| Long text | variable | Padded to nearest: 4KB / 16KB / 64KB |
| Image | variable | Re-encoded JPEG, padded to nearest: 256KB / 512KB / 2MB |
| Voice note | variable | Opus CBR 32kbps, padded to bucket |

**Result:** All packets look identical in size on the wire. An observer cannot tell if you sent a text or a 2MB image.

### 4. Media Normalization
- **Images:** EXIF metadata stripped (removes GPS, device info, timestamps), re-encoded as JPEG via Canvas API
- **Audio:** Recorded at Constant Bit Rate (CBR) Opus 32kbps — silence and speech produce identically-sized chunks
- **All types** wrapped in the same Protobuf container — type hidden inside ciphertext

### 5. Ephemeral Messages
- Per-message TTL: 30 seconds / 5 minutes / 1 hour / no expiry
- Redis TTL auto-deletes queued messages on the server
- Client wipes decrypted message from memory and DOM after TTL expires

### 6. Privacy-Preserving Audit Log
```
What is logged:
  actor_hash    = SHA256(sessionToken)      ← not reversible to real identity
  action        = "text_message"            ← type only, no content
  channel_hash  = SHA256(channelId)         ← not reversible to participants
  fuzzy_ts      = round(timestamp, 5 min)   ← timing attack prevention
  commitment    = HMAC(sessionKey, iv+ciphertext_prefix)

What is NEVER logged:
  ✗ Message content
  ✗ Real user identity
  ✗ Exact timestamps
  ✗ IP addresses
  ✗ File contents
```

---

## Features

### Multi-Modal Secure Communication
| Feature | Implementation |
|---------|---------------|
| Encrypted text chat | AES-256-GCM, real-time via WebSocket |
| Encrypted image sharing | EXIF stripped, normalized, bucket-padded, AES-256-GCM |
| Encrypted voice notes | MediaRecorder → Opus CBR → AES-256-GCM → binary blob |
| Ephemeral messages | TTL selector per message, client + server auto-wipe |
| Contact discovery | Public key lookup via callsign from gateway |

### Security Features
| Feature | Implementation |
|---------|---------------|
| End-to-end encryption | AES-256-GCM, keys never leave device |
| Perfect forward secrecy | New session key per channel via HKDF |
| Anonymous identity | Ed25519 keypair, no PII required |
| IP masking | Two-server relay (simplified OHTTP) |
| Metadata hiding | Fixed-size packets, CBR audio, EXIF strip |
| Audit commitments | HMAC-SHA256 — proves send without revealing content |
| Zero-trust server | Server only sees ciphertext it cannot decrypt |

### Dashboard
- D3.js force-directed graph of anonymized actors and channels
- SHA-256 hashed node labels — no real IDs visible
- Message type breakdown (text / image / voice)
- Real-time event feed with fuzzy timestamps
- Content exposure counter (always 0 bytes)

---

## Tech Stack

### Frontend — `client/`
| Technology | Purpose |
|-----------|---------|
| React 18 + TypeScript | UI framework |
| Vite | Build tool + dev server |
| Tailwind CSS | Styling |
| Framer Motion | Animations |
| **TweetNaCl** | Ed25519 signing, X25519 ECDH |
| **Web Crypto API** (browser built-in) | AES-256-GCM, HKDF, HMAC, SHA-256 |
| Socket.io-client | WebSocket connection to relay |
| Zustand | State management |
| D3.js | Audit dashboard graph |
| lucide-react | Icons |
| JetBrains Mono | Monospace font |

### Backend — `relay/` and `gateway/`
| Technology | Purpose |
|-----------|---------|
| Node.js 20 + TypeScript | Runtime |
| Express | HTTP server |
| Socket.io | WebSocket server |
| Redis | Ephemeral message queue + TTL |
| SQLite + better-sqlite3 | Public key store + audit log |

### Infrastructure
| Technology | Purpose |
|-----------|---------|
| Docker + Docker Compose | Containerization |
| Protobuf (proto3) | Message wire format definition |

---

## Project Structure

```
s:/enigma/
│
├── client/                          ← React PWA (runs in browser)
│   └── src/
│       ├── crypto/
│       │   ├── identity.ts          ← Ed25519 keypair + callsign generation
│       │   ├── session.ts           ← X25519 ECDH + HKDF session key derivation
│       │   ├── encrypt.ts           ← AES-256-GCM encrypt/decrypt + bucket padding
│       │   ├── normalize.ts         ← EXIF strip, image resize, CBR audio
│       │   └── commitment.ts        ← HMAC audit commitments + SHA-256 hashing
│       ├── store/
│       │   ├── identityStore.ts     ← Your keypair + relay token (Zustand)
│       │   ├── chatStore.ts         ← Messages + contacts + active channel
│       │   └── auditStore.ts        ← Local audit log entries
│       ├── hooks/
│       │   └── useSocket.ts         ← WebSocket connection, receive + decrypt messages
│       ├── components/
│       │   ├── MessageBubble.tsx    ← Text/image/voice bubble with TTL countdown
│       │   └── AddContact.tsx       ← Callsign lookup + contact add modal
│       ├── pages/
│       │   ├── Onboarding.tsx       ← Terminal boot sequence + key generation
│       │   ├── Chat.tsx             ← Main messaging UI (text + image + voice)
│       │   └── Dashboard.tsx        ← D3 audit graph + event log
│       └── App.tsx                  ← Router (onboarding → chat → dashboard)
│
├── relay/
│   └── src/index.ts                 ← Anonymizing relay (IP shield, token assignment)
│
├── gateway/
│   └── src/
│       ├── index.ts                 ← Message router + REST API (identity, audit)
│       └── db.ts                    ← SQLite: public keys + hashed audit log
│
├── proto/
│   └── message.proto                ← SecurePacket + Envelope wire format
│
└── docker-compose.yml               ← Redis + Gateway + Relay containers
```

---

## How to Run

### Prerequisites
```
Node.js 20+    https://nodejs.org
```

### Step 1 — Start Gateway (Terminal 1)
```bash
cd s:/enigma/gateway
npm run dev
# Listening on :3002
```

### Step 2 — Start Relay (Terminal 2)
```bash
cd s:/enigma/relay
npm run dev
# Listening on :3001
# Connected to Gateway ✓
```

### Step 3 — Start Frontend (Terminal 3)
```bash
cd s:/enigma/client
npm run dev
# http://localhost:5173
```

### Step 4 — Demo with Two Users
1. Open `http://localhost:5173` in **Tab A** and **Tab B**
2. In each tab: click **Generate Secure Identity** — get a unique callsign
3. In each tab: click **Copy relay token** — copy it
4. In Tab A: click **+** → enter Tab B's callsign + paste Tab B's relay token → **Lookup & Add**
5. In Tab B: same — add Tab A as a contact
6. Start messaging — all content is AES-256-GCM encrypted before leaving the browser
7. Try image send — EXIF is stripped, size normalized before encryption
8. Try voice note — record → stop → Opus CBR blob encrypted and sent
9. Set TTL to 30 seconds — watch the message countdown and self-destruct
10. Open **Audit Dashboard** — see anonymized D3 graph, zero content exposed

---

## What the Server Sees vs. What It Doesn't

```
USER SENDS: "Enemy sighted at grid 4-7, 3 hostiles, image attached"

RELAY SEES:
  from: [random relay token, no IP logged]
  to:   [recipient relay token]
  data: 4096 bytes of encrypted binary (looks identical to any other 4KB packet)

GATEWAY SEES:
  token: [hashed session token]
  data:  4096 bytes of encrypted binary
  logs:  actor=a3f8b2c1... action=image_message ts=1745000000000 (±5 min)

SERVER CANNOT DETERMINE:
  ✗ What was said
  ✗ Who said it (real identity)
  ✗ Whether it was text, image, or voice
  ✗ The sender's IP address
  ✗ Exact timing

USER B RECEIVES:
  ✓ Decrypted message (only in their browser)
  ✓ Decrypted image (rendered locally, EXIF already stripped)
```

---

## Security Guarantees

| Threat | Mitigation |
|--------|-----------|
| Server compromise | Server only has ciphertext — decryption key never transmitted |
| Man-in-the-middle | AES-GCM authentication tag — any tampering causes decryption failure |
| Traffic analysis (size) | All packets padded to fixed bucket sizes |
| Traffic analysis (timing) | Uniform polling intervals; CBR audio hides speech patterns |
| Identity exposure | Ed25519 pseudonymous IDs; no PII at registration |
| IP tracking | Two-server relay — relay knows IP but not content; gateway knows content but not IP |
| Metadata leakage | EXIF stripping; fuzzy timestamps; hashed audit IDs |
| Message persistence | Ephemeral TTL; Redis auto-delete; client-side DOM wipe |
| Media type inference | All types padded to same bucket sizes; type hidden inside ciphertext |

---

## What the Judges Asked About

### FHE (Fully Homomorphic Encryption)
FHE allows computation on encrypted data without decrypting it. In our system, it would apply to the audit layer: the commander's dashboard could run `COUNT(messages_today)` directly on encrypted audit records, getting an encrypted result that only the commander can decrypt — the server computes aggregate statistics without ever seeing individual events.

**Why we didn't implement it for the hackathon:** FHE is 1,000–100,000× slower than standard encryption. A single query takes seconds to minutes. Libraries exist (Microsoft SEAL, TFHE-rs, OpenFHE) but real-time messaging with FHE is physically impractical today. Our HMAC commitment scheme achieves the same audit goal at production speed. FHE would be the production upgrade for the offline analytics layer.

### ZKP vs FHE
| | ZKP (Zero-Knowledge Proof) | FHE |
|--|--|--|
| Question | "Prove you're authorized without revealing who you are" | "Compute on encrypted data without seeing it" |
| Our use | HMAC commitment = simplified ZKP for audit | Future: aggregate stats on encrypted logs |
| Implemented | ✓ (HMAC-SHA256 commitments) | Described as future work |

### WebSocket Anonymity
Raw WebSockets expose client IP to the server. Our mitigation:
- **Two-server relay** — relay sees IP but not content; gateway sees content but not IP
- **Pseudonymous tokens** — server never sees real user IDs in socket events
- **Sealed sender** — sender ID encrypted inside payload, not visible in routing header

---

## Future Roadmap

| Feature | Technology | Timeline |
|---------|-----------|---------|
| Full MLS group messaging | OpenMLS / TreeKEM | v2.0 |
| True OHTTP implementation | RFC 9458 | v2.0 |
| FHE audit computation | TFHE-rs / Microsoft SEAL | v2.1 |
| Full ZK-SNARK proofs | snarkjs / circom | v2.1 |
| Mesh radio fallback | Reticulum / Meshtastic (LoRa) | v3.0 |
| Blind signature onboarding | RSA blind signatures | v2.0 |
| Post-quantum cryptography | CRYSTALS-Kyber / Dilithium | v3.0 |

---

## Team

**Project:** Shadow Mesh
**Event:** Hackathon 2026
**Track:** Cybersecurity / Defense Technology

---

*"The first privacy decision happens at onboarding itself. The last privacy guarantee holds at the audit log. In between, the server is never trusted — because it is never given anything worth trusting."*
