# Shadow Mesh Architecture Document

## Overview
Shadow Mesh is a Metadata-Blind, Zero-Trust communication platform. It utilizes a split-knowledge backend architecture (Relay + Gateway) and executes all cryptography natively in the client browser using Web Crypto and Ed25519/X25519 elliptic curves.

## 1. Storage & Enclave Simulation (Local Frontend)
Since web browsers cannot natively access hardware Secure Enclaves, Shadow Mesh simulates one using IndexedDB and the Web Cryptography API (`crypto.subtle`).
- **The Wrap Key:** A non-extractable AES-256-GCM key (`storage-wrap-key`) is generated natively by the browser. 
- **Encryption at Rest:** All cryptographic keypairs are symmetrically encrypted using this Wrap Key *before* being written to IndexedDB.
- **Protection:** Even if the origin is compromised by XSS, malicious scripts cannot extract the raw Wrap Key from the browser's memory, ensuring encrypted key payloads in IndexedDB cannot be deciphered.

## 2. Key Generation (Identity Creation)
When a user launches the application for the first time, three distinct key pairs are immediately generated locally:
1. **Identity KeyPair (X25519):** A long-term permanent key for encryption and proving identity.
2. **Signing KeyPair (Ed25519):** A long-term signature key (the "Digital Pen").
3. **Signed Pre-Key (X25519):** A medium-term key that is mathematically signed by the Ed25519 Signing Key. This proves ownership and prevents Man-In-The-Middle (MITM) attacks during session establishment.

All keys are instantly stored in the simulated Secure Enclave (IndexedDB), and the user is mapped to a human-readable `pseudoId` (Callsign).

## 3. Out-of-Band Discovery (QR Code Scan)
To avoid leaking social graphs to the server, users must exchange their credentials manually (e.g., scanning a QR code in person).
- The QR Code or full json transmits a **Public Bundle**: `pseudoId`, `relayToken` (routing address), `identityPublicKey`, `signedPreKeyPublic`, and the `signature`.
- The scanning device verifies the Ed25519 `signature` to guarantee the Pre-Key wasn't tampered with.

## 4. Perfect Forward Secrecy & X3DH Envelope
When Alice sends a message to Bob, the client implements **Extended Triple Diffie-Hellman (X3DH)**. 
1. Alice's client generates a random, one-time **Ephemeral KeyPair**.
2. Her client performs 3 simultaneous Diffie-Hellman mathematical exchanges using her keys, Bob's permanent keys, and the new Ephemeral Key.
3. The results are fed into an HKDF (HMAC-based Key Derivation Function) to output a pristine AES-256 Master Key.
4. Alice encrypts the payload using AES-256. 
5. She attaches her `identityPublicKey` and the `ephemeralPublicKey` to the unencrypted header.
6. **Critical Security Step:** Alice's client instantly deletes the Private Ephemeral Key. If an attacker seizes Alice's device in the future, they cannot decrypt this message because the math required a key that was immediately destroyed.

## 5. Metadata-Blind Routing
The encrypted payload (Ciphertext + Header) is sent to the network.
- **The Relay Server:** Strips Alice's IP address and gives her a temporary Session Token. It blindly pushes the traffic to the Gateway.
- **The Gateway Server:** Reads the destination `relayToken` and routes the encrypted blob to Bob's socket. It logs a hash of the transmission for auditing, but cannot read the contents and does not know Alice's IP.


## 6. Privacy-Preserving Audit Logs (Cryptographic Commitments)
**Requirement:** "Activity tracking without content exposure."
- To satisfy enterprise and defense compliance, the network must maintain an audit trail of communications without ever knowing what was said.
- **The Protocol (HMAC-SHA256):** Before sending a message, the client generates a Cryptographic Commitment�a one-way HMAC-SHA256 hash of the encrypted payload and its metadata. 
- **Gateway's Role:** The Gateway receives the encrypted message and the hash. It routes the message to the recipient and stores the hash in its SQLite database alongside the temporary routing tokens and a timestamp. 
- **Zero-Knowledge Concept:** The Gateway holds mathematical proof (a receipt) that a specific transaction occurred. However, because SHA-256 is irreversible, the Gateway has "Zero Knowledge" of the message content. If an auditor later needs to verify a message, the sender can provide the original message, re-hash it, and prove it matches the Gateway's unforgeable log, completely preserving anonymity and content secrecy in transit.

## 7. Temporary Offline Queue (Ephemerality)
**Requirement:** Messages must be delivered to temporarily disconnected routing tokens without persisting indefinitely.
- The Gateway implements a strict **Time-to-Live (TTL) offline queue** (defaulting to 1 hour).
- If a recipient is offline, the encrypted blob is temporarily held in a Redis Cache (or fallback SQLite table).
- After the TTL expires, the ciphertext is biologically destroyed by the database to prevent long-term data at rest, enforcing the principle of strict Ephemerality dictated by the protocol.

## 8. Core Cryptographic Pillars (Why This is Secure)
1. **End-to-End Encryption (AES-GCM):** Standard military-grade encryption for all payloads.
2. **Perfect Forward Secrecy (X3DH):** Even if permanent keys are compromised tomorrow, past messages cannot be decrypted because the app constantly burns its temporary session keys.
3. **Hardware-Level Software Sandbox (Web Crypto API):** Decrypted keys are *never* stored in localStorage where a malicious browser extension could steal them. They are wrapped in non-extractable IndexedDB instances.
4. **Metadata Hiding:** The normalize.ts protocol artificially pads the byte size of messages. Hackers monitoring Wi-Fi traffic cannot mathematically distinguish between a text message, a voice note, or an image.

## 9. The Unique Selling Proposition (USP Pitch Script for Judges)
> "Our unique selling proposition is **Split-Knowledge Architecture**. Existing platforms like Telegram or Signal either know who you are, or who you are talking to. They hold the 'Social Graph.' 
> 
> Our system splits the server into two blind halves:
> 1. Our **Relay Server** acts as an anonymizing proxy. It takes the sender's IP address, strips it, assigns a random temporary 'Relay Token', and passes the data forward.
> 2. Our **Gateway Server** receives an encrypted blob and a destination token. It knows the destination, but has absolutely no idea who the sender actually is and has no idea what the message says.
> 
> By physically separating knowledge of the **Sender (IP)** from the **Receiver (Destination)**, even if a nation-state hacks our Gateway Server, they learn nothing about our users' real identities. We combined this with **Perfect Forward Secrecy (X3DH)** and an **Offline Queue that auto-destroys messages after 1 hour**, ensuring zero long-term data at rest. We didn't just build encryption; we built an architecture immune to traffic analysis."
