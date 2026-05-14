import { Hono } from "hono";
import { stream } from "hono/streaming";

export const bedrockRoutes = new Hono();

/**
 * Proxy POST /api/bedrock/... → AWS Bedrock
 *
 * Authorization header carries: "ACCESS_KEY:SECRET_KEY:REGION"
 * This proxy signs the request with AWS SigV4 before forwarding.
 */
bedrockRoutes.post("/*", async (c) => {
  const credentials = c.req.header("Authorization")?.replace("Bearer ", "");

  if (!credentials) {
    return c.json({ error: "Authorization header with AWS credentials required" }, 401);
  }

  const parts = credentials.split(":");
  if (parts.length < 3) {
    return c.json(
      { error: "Invalid credentials format. Expected ACCESS_KEY:SECRET_KEY:REGION" },
      400,
    );
  }

  const [accessKeyId, secretAccessKey, region = "us-east-1"] = parts as [string, string, string];

  const body = await c.req.text();
  const path = c.req.path.replace("/api/bedrock", "");
  const modelId = path.replace("/model/", "").split("/")[0];

  const endpoint = `https://bedrock-runtime.${region}.amazonaws.com${path}`;

  // SigV4 signing
  const signedHeaders = await signAWSRequest({
    method: "POST",
    url: endpoint,
    body,
    service: "bedrock",
    region,
    accessKeyId,
    secretAccessKey,
  });

  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...signedHeaders,
      "Content-Type": "application/json",
    },
    body,
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    return c.json({ error: errText }, upstream.status as 400 | 401 | 403 | 429 | 500);
  }

  const contentType = upstream.headers.get("content-type") ?? "application/json";
  c.header("Content-Type", contentType);

  if (upstream.body) {
    return stream(c, async (s) => {
      const reader = upstream.body!.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await s.write(value);
      }
    });
  }

  const data = await upstream.json() as unknown;
  return c.json(data);
});

/** Minimal AWS SigV4 signing implementation */
async function signAWSRequest(opts: {
  method: string;
  url: string;
  body: string;
  service: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}): Promise<Record<string, string>> {
  const { method, url, body, service, region, accessKeyId, secretAccessKey } = opts;

  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");

  const parsedUrl = new URL(url);
  const host = parsedUrl.host;
  const canonicalUri = parsedUrl.pathname;
  const canonicalQueryString = "";

  const bodyHash = await sha256Hex(body);
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeadersList = "content-type;host;x-amz-date";

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeadersList,
    bodyHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await getSigningKey(secretAccessKey, dateStamp, region, service);
  const signature = await hmacHex(signingKey, stringToSign);

  return {
    "x-amz-date": amzDate,
    "x-amz-content-sha256": bodyHash,
    Authorization: [
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeadersList}`,
      `Signature=${signature}`,
    ].join(", "),
  };
}

async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return toHex(buffer);
}

async function hmac(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const encoder = new TextEncoder();
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

async function hmacHex(key: ArrayBuffer, data: string): Promise<string> {
  return toHex(await hmac(key, data));
}

async function getSigningKey(
  secret: string,
  date: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const kSecret = encoder.encode(`AWS4${secret}`);
  const kDate = await hmac(kSecret, date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
