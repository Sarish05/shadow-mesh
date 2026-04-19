# Shadow Mesh

## Problem Statement: Secure & Privacy-Preserving Multi-Modal Intelligence Sharing Platform

In high-risk operational environments (defense, disaster response, critical infrastructure), teams rely on the rapid sharing of intelligence items such as text updates, images, and voice inputs. However, existing communication systems often expose sensitive data during transmission, making them vulnerable to interception, unauthorized access, and metadata leakage. 

Even when intermediate encryption is used, network layers (servers or relays) can still infer who is communicating, the type of data being shared, and communication patterns, leading to potential security breaches. Current systems lack fine-grained access control and privacy-preserving auditability, forcing organizations to choose between data security and operational efficiency.

## Our Solution: Split-Knowledge Architecture

Shadow Mesh is a Metadata-Blind, Zero-Trust communication platform built to solve these exact vulnerabilities. 

By employing a split-knowledge backend architecture and executing all cryptography natively in the client browser, Shadow Mesh ensures that sensitive multi-modal intelligence can be shared securely without being exposed at any intermediate layer. 

The architecture strictly separates identity from destination. The Relay server knows the sender's origin but not the destination or content, while the Gateway server knows the destination and logged cryptographic hash but has no knowledge of the sender's identity or message content. 

## Key Capabilities & Requirements Fulfilled

*   **Multi-Modal End-to-End Encryption:** Supports secure sharing of text, image, and voice data. All payloads are encrypted locally on the browser using AES-256-GCM before transmission.
*   **Anonymous Communication & Metadata Hiding:** The Relay server strips real IP addresses and assigns abstract routing tokens. The protocol artificially pads the byte sizes of messages, ensuring that adversaries monitoring network traffic cannot distinguish between a text message, an image, or a voice note.
*   **Real-Time Messaging via Zero-Trust WebSockets:** Operates via Socket.io in real-time. The transport layer is treated as entirely hostile—only opaque, authenticated ciphertext blobs are transmitted.
*   **Privacy-Preserving Logs:** Uses HMAC-SHA256 to generate irreversible Cryptographic Commitments. The central Gateway stores an unforgeable audit trail of communications to satisfy compliance without ever possessing the plaintext content.
*   **Dynamic Key Exchange & Perfect Forward Secrecy (PFS):** Utilizes Extended Triple Diffie-Hellman (X3DH) combined with Ed25519 identity verification. Ephemeral, session-based keys are burned immediately after payload encryption, ensuring past messages cannot be retroactively decrypted if a permanent key is compromised.
*   **Reduced Central Dependency (P2P Handshakes):** Identity discovery is handled out-of-band via QR Code scanning. Contacts establish secure cryptographic trust locally without relying on the server for key distribution, eliminating Man-In-The-Middle (MITM) attacks.
*   **Ephemeral Messages:** The system employs a Time-to-Live (TTL) offline queue. Encrypted blobs stored for temporarily offline contacts are automatically destroyed after expiration, strictly limiting long-term data at rest.

## Technology Stack & Cryptography

### Frontend (Local Secure Enclave)
*   **Core Logic:** React 19, Vite, TypeScript
*   **State Management:** Zustand (with localForage/IndexedDB persistence)
*   **Styling:** Tailwind CSS v4
*   **Auxiliary:** HTML5-QRCode (Out-of-band Key Discovery), Recharts (Audit Log Visualization Dashboard)

### Backend (Relay & Gateway)
*   **Core Logic:** Node.js, Express.js, TypeScript
*   **Transport:** Socket.io (Bidirectional Event Transport)
*   **Storage:** SQLite (Privacy-Preserving Audit Logs), Redis (Fast TTL Offline Queue for Ephemerality)

### Cryptographic Primitives 
*   **Web Cryptography API:** Native AES-256-GCM symmetric encryption and unextractable Wrap Key generation for IndexedDB local storage.
*   **TweetNaCl.js:** Audited elliptic curve operations unsupported uniformly across standard Web Crypto implementations.
*   **Ed25519:** Detached digital signatures for identity verification during key exchange.
*   **X25519 (Curve25519):** Diffie-Hellman Key Exchange parameters.
*   **X3DH:** Protocol to derive perfect forward secrecy keys.
*   **HKDF:** HMAC-based Extract-and-Expand Key Derivation Function.
*   **HMAC-SHA256:** One-way hashing for secure audit trails.

## Getting Started

### Prerequisites
*   Node.js (v18+)
*   NPM or Yarn
*   Redis (Running locally or remotely for offline queues)

### Installation

1.  Clone the repository and install dependencies in all subdirectories.
    ```bash
    git clone https://github.com/your-org/enigma.git
    cd enigma
    
    # Install client dependencies
    cd client && npm install
    
    # Install relay dependencies
    cd ../relay && npm install
    
    # Install gateway dependencies
    cd ../gateway && npm install
    ```

2.  Environment Configuration
    Create `.env` files in both the `relay` and `gateway` directories specifying ports, TTL settings, and Redis endpoints as required by your specific environment.

3.  Run the Application Platforms
    Open three terminal windows to run the split-architecture components:
    
    ```bash
    # Terminal 1: Relay Server
    cd relay
    npm run dev
    
    # Terminal 2: Gateway Server
    cd gateway
    npm run dev
    
    # Terminal 3: Secure Client
    cd client
    npm run dev
    ```

4.  Onboarding 
    *   Navigate to the local client URL (e.g., `http://localhost:5173`).
    *   The device generates local Secure Enclave keys automatically.
    *   Share profiles via the built-in QR code scanner or manual sync to begin creating X3DH secure message pipelines.

## Project Architecture Details
For an in-depth understanding of the mathematical procedures, split-knowledge routing, and offline queue TTL implementations, please refer to the comprehensive `ARCHITECTURE.md` file included in this repository.