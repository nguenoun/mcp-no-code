import type { WorkerDeployConfig } from './cloudflare-deployer'

type SafeToolConfig = {
  name: string
  description: string | null
  httpMethod: string
  httpUrl: string
  parametersSchema: Record<string, unknown>
  headersConfig: Array<{ key: string; value: string }>
}

function escapeJsDoubleQuoted(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
}

function toSafeToolConfig(config: WorkerDeployConfig): SafeToolConfig[] {
  return config.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    httpMethod: tool.httpMethod,
    httpUrl: tool.httpUrl,
    parametersSchema: tool.parametersSchema,
    headersConfig: tool.headersConfig
      .filter((header) => !header.isSecret)
      .map((header) => ({ key: header.key, value: header.value })),
  }))
}

export function generateWorkerScript(config: WorkerDeployConfig): string {
  const safeTools = toSafeToolConfig(config)
  const toolsJson = JSON.stringify(safeTools)
  const serverId = escapeJsDoubleQuoted(config.serverId)
  const baseUrl = escapeJsDoubleQuoted(config.baseUrl ?? '')

  // The generated Worker implements MCP StreamableHTTP (JSON-RPC 2.0) with
  // zero external dependencies — everything is inlined so Cloudflare Workers
  // can execute it without any npm resolution.
  return `// worker.js — generated automatically by MCPBuilder
// Do not edit manually

const TOOLS_CONFIG = ${toolsJson};
const BASE_URL = "${baseUrl}";
const SERVER_ID = "${serverId}";

// ─── URL helpers ─────────────────────────────────────────────────────────────

function resolveUrl(httpUrl) {
  if (httpUrl.startsWith("http://") || httpUrl.startsWith("https://")) return httpUrl;
  const base = BASE_URL.replace(/\\/$/, "");
  const path = httpUrl.replace(/^\\//, "");
  return base ? base + "/" + path : httpUrl;
}

function applyPathParams(url, params, consumed) {
  return url.replace(/\\{([^}]+)\\}/g, (_match, key) => {
    if (key in params) {
      consumed.add(key);
      return encodeURIComponent(String(params[key]));
    }
    return _match;
  });
}

function buildRequestParts(tool, params) {
  const consumed = new Set();
  let targetUrl = applyPathParams(resolveUrl(tool.httpUrl), params, consumed);
  const remaining = Object.entries(params).filter(([k]) => !consumed.has(k));
  const isBody = ["POST", "PUT", "PATCH"].includes(String(tool.httpMethod).toUpperCase());
  let body;

  if (isBody) {
    const payload = Object.fromEntries(remaining);
    body = Object.keys(payload).length > 0 ? JSON.stringify(payload) : undefined;
  } else if (remaining.length > 0) {
    const u = new URL(targetUrl);
    for (const [k, v] of remaining) {
      if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    }
    targetUrl = u.toString();
  }

  return { targetUrl, body };
}

// ─── Credential helpers ───────────────────────────────────────────────────────

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}

async function decryptCredential(encryptedB64, keyHex) {
  const combined = Uint8Array.from(atob(encryptedB64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const tag = combined.slice(12, 28);
  const ciphertext = combined.slice(28);
  const key = await crypto.subtle.importKey("raw", hexToBytes(keyHex), { name: "AES-GCM" }, false, ["decrypt"]);
  const merged = new Uint8Array(ciphertext.length + tag.length);
  merged.set(ciphertext, 0);
  merged.set(tag, ciphertext.length);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, merged);
  return new TextDecoder().decode(plain);
}

function buildAuthHeaders(credentialType, value) {
  if (credentialType === "BEARER") return { Authorization: "Bearer " + value };
  if (credentialType === "API_KEY") return { "X-Api-Key": value };
  if (credentialType === "BASIC_AUTH") {
    const [u, p] = String(value).split(":");
    return { Authorization: "Basic " + btoa((u || "") + ":" + (p || "")) };
  }
  return {};
}

// ─── E1. JWT verification — WebCrypto (HS256) ─────────────────────────────────
//
// Vérifie signature, exp et sid sans dépendance externe.
// WebCrypto est disponible nativement dans les Cloudflare Workers.

function base64urlDecode(str) {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, "=");
  return atob(padded);
}

function base64urlToBytes(str) {
  return Uint8Array.from(base64urlDecode(str), (c) => c.charCodeAt(0));
}

async function verifyJwt(token, secret, expectedSid) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    const [headerB64, payloadB64, signatureB64] = parts;

    // Decode and parse payload
    const payloadJson = base64urlDecode(payloadB64);
    const payload = JSON.parse(payloadJson);

    // Check expiry (exp claim, seconds since epoch)
    if (typeof payload.exp === "number" && Date.now() / 1000 > payload.exp) return false;

    // Check sid — token must target this specific server
    if (payload.sid !== expectedSid) return false;

    // Import HMAC-SHA256 key from secret string
    const secretBytes = new TextEncoder().encode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    // Verify signature over "header.payload"
    const signatureBytes = base64urlToBytes(signatureB64);
    const dataBytes = new TextEncoder().encode(headerB64 + "." + payloadB64);

    return await crypto.subtle.verify("HMAC", cryptoKey, signatureBytes, dataBytes);
  } catch {
    return false;
  }
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

function reportMetrics(env, toolName, status, latencyMs, errorMessage) {
  if (!env.INTERNAL_API_URL || !env.INTERNAL_SECRET) return Promise.resolve();
  return fetch(env.INTERNAL_API_URL + "/api/internal/worker-log", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Secret": env.INTERNAL_SECRET },
    body: JSON.stringify({
      serverId: SERVER_ID,
      toolName,
      status,
      latencyMs,
      errorMessage: errorMessage ?? null,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {});
}

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(tool, args, env, ctx) {
  const start = Date.now();
  try {
    const headers = { "Content-Type": "application/json" };

    for (const h of tool.headersConfig || []) headers[h.key] = h.value;

    if (env.CREDENTIAL && env.CREDENTIAL_TYPE && env.ENCRYPTION_KEY) {
      const plain = await decryptCredential(env.CREDENTIAL, env.ENCRYPTION_KEY);
      Object.assign(headers, buildAuthHeaders(env.CREDENTIAL_TYPE, plain));
    }

    const { targetUrl, body } = buildRequestParts(tool, args || {});
    const res = await fetch(targetUrl, {
      method: tool.httpMethod,
      headers,
      body,
      signal: AbortSignal.timeout(30000),
    });

    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const errText = await res.text();
      const msg = "HTTP " + res.status + ": " + errText;
      ctx.waitUntil(reportMetrics(env, tool.name, "ERROR", latencyMs, msg));
      return { isError: true, content: [{ type: "text", text: msg }] };
    }

    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await res.json() : await res.text();
    ctx.waitUntil(reportMetrics(env, tool.name, "SUCCESS", latencyMs, null));
    return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.waitUntil(reportMetrics(env, tool.name, "ERROR", Date.now() - start, msg));
    return { isError: true, content: [{ type: "text", text: "Tool execution failed: " + msg }] };
  }
}

// ─── MCP JSON-RPC handler (StreamableHTTP) ───────────────────────────────────

async function handleMcpMessage(message, env, ctx) {
  const { id, method, params } = message;

  // Notifications have no id — fire-and-forget, no response needed
  if (id === undefined || id === null) return null;

  if (method === "initialize") {
    return {
      jsonrpc: "2.0", id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_ID, version: "1.0.0" },
      },
    };
  }

  if (method === "ping") {
    return { jsonrpc: "2.0", id, result: {} };
  }

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0", id,
      result: {
        tools: TOOLS_CONFIG.map((t) => ({
          name: t.name,
          description: t.description || "",
          inputSchema: (t.parametersSchema && Object.keys(t.parametersSchema).length > 0)
            ? t.parametersSchema
            : { type: "object", properties: {} },
        })),
      },
    };
  }

  if (method === "tools/call") {
    const toolName = params?.name;
    const args = params?.arguments ?? {};
    const tool = TOOLS_CONFIG.find((t) => t.name === toolName);
    if (!tool) {
      return { jsonrpc: "2.0", id, error: { code: -32601, message: "Tool not found: " + toolName } };
    }
    const result = await executeTool(tool, args, env, ctx);
    return { jsonrpc: "2.0", id, result };
  }

  return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found: " + method } };
}

// ─── Worker entry point ───────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        serverId: SERVER_ID,
        toolCount: TOOLS_CONFIG.length,
        tools: TOOLS_CONFIG.map((t) => t.name),
      });
    }

    // ── E2. Auth — branchement sur AUTH_MODE ──────────────────────────────────
    //
    // AUTH_MODE = 'OAUTH'   → vérifie le JWT avec verifyJwt (WebCrypto HS256)
    // AUTH_MODE = 'API_KEY' → compare le Bearer token à MCP_API_KEY (défaut)

    const authHeader = request.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (env.AUTH_MODE === "OAUTH") {
      if (!bearerToken || !env.OAUTH_SIGNING_KEY) {
        return new Response(
          JSON.stringify({ error: "Unauthorized", message: "Missing Bearer token or signing key" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      const valid = await verifyJwt(bearerToken, env.OAUTH_SIGNING_KEY, SERVER_ID);
      if (!valid) {
        return new Response(
          JSON.stringify({ error: "Unauthorized", message: "Invalid or expired OAuth token" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
    } else {
      // API_KEY (default)
      if (!bearerToken || bearerToken !== env.MCP_API_KEY) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    // ── E3. Streamable HTTP transport — POST /mcp ─────────────────────────────
    //
    // Reçoit du JSON-RPC 2.0 (single object ou batch array).
    // Retourne la réponse JSON directement (Content-Type: application/json).
    // Pas de SSE — one-shot request/response.

    if (url.pathname === "/mcp" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
      }

      const messages = Array.isArray(body) ? body : [body];
      const responses = (await Promise.all(messages.map((m) => handleMcpMessage(m, env, ctx)))).filter(Boolean);

      if (responses.length === 0) return new Response(null, { status: 202 });
      const payload = responses.length === 1 ? responses[0] : responses;
      return Response.json(payload, { headers: { "Content-Type": "application/json" } });
    }

    return new Response("Not Found", { status: 404 });
  },
};
`
}
