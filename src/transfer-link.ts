import {
  createHmac,
  pbkdf2Sync,
  timingSafeEqual,
} from "node:crypto";
import { getUserContextById, type UserContext } from "./auth";

const SIGNED_ID_SALT = "active_record/signed_id";
const TRANSFER_LINK_PURPOSE = "user/transfer";
const SIGNED_ID_KEY_ITERATIONS = 2 ** 16;
const SIGNED_ID_KEY_BYTES = 64;

interface RailsSignedIdEnvelope {
  _rails?: {
    data?: unknown;
    message?: unknown;
    exp?: unknown;
    pur?: unknown;
  };
}

export type TransferLinkValidationResult =
  | { ok: true; userContext: UserContext }
  | { ok: false; reason: "missing_secret" | "invalid" };

function getSecretKeyBase(): string | null {
  return (
    process.env.TELEBUGS_SECRET_KEY_BASE ??
    process.env.SECRET_KEY_BASE ??
    null
  );
}

function extractSignedId(value: string): string | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  try {
    const url = new URL(trimmedValue);
    const segments = url.pathname.split("/").filter(Boolean);
    const transfersIndex = segments.lastIndexOf("transfers");
    const signedId = segments[transfersIndex + 1];

    return signedId ? decodeURIComponent(signedId) : null;
  } catch {
    return trimmedValue;
  }
}

function decodeBase64Url(value: string): string {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64url").toString("utf8");
}

function deriveSignedIdSecret(secretKeyBase: string): Buffer {
  return pbkdf2Sync(
    secretKeyBase,
    SIGNED_ID_SALT,
    SIGNED_ID_KEY_ITERATIONS,
    SIGNED_ID_KEY_BYTES,
    "sha1"
  );
}

function digestMatches(encodedPayload: string, signature: string, secret: Buffer): boolean {
  const expectedSignature = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("hex");

  const expectedBytes = Buffer.from(expectedSignature);
  const actualBytes = Buffer.from(signature);

  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}

function parseUserId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }

  return null;
}

function decodeLegacySignedIdMessage(message: string): unknown | null {
  try {
    return JSON.parse(Buffer.from(message, "base64").toString("utf8"));
  } catch {
    try {
      return JSON.parse(Buffer.from(message, "base64url").toString("utf8"));
    } catch {
      return null;
    }
  }
}

function readEnvelopeData(railsMetadata: NonNullable<RailsSignedIdEnvelope["_rails"]>): unknown | null {
  if (railsMetadata.data !== undefined) {
    return railsMetadata.data;
  }

  if (typeof railsMetadata.message === "string") {
    return decodeLegacySignedIdMessage(railsMetadata.message);
  }

  return null;
}

function readSignedIdUserId(signedId: string, secretKeyBase: string): number | null {
  const signatureLength = 64;
  const separatorIndex = signedId.length - signatureLength - 2;
  if (separatorIndex <= 0 || signedId.slice(separatorIndex, separatorIndex + 2) !== "--") {
    return null;
  }

  const encodedPayload = signedId.slice(0, separatorIndex);
  const signature = signedId.slice(separatorIndex + 2);
  if (!/^[0-9a-f]{64}$/i.test(signature)) {
    return null;
  }

  const secret = deriveSignedIdSecret(secretKeyBase);
  if (!digestMatches(encodedPayload, signature, secret)) {
    return null;
  }

  let envelope: RailsSignedIdEnvelope;
  try {
    envelope = JSON.parse(decodeBase64Url(encodedPayload)) as RailsSignedIdEnvelope;
  } catch {
    return null;
  }

  const railsMetadata = envelope._rails;
  if (!railsMetadata || railsMetadata.pur !== TRANSFER_LINK_PURPOSE) {
    return null;
  }

  if (railsMetadata.exp !== undefined) {
    if (typeof railsMetadata.exp !== "string") {
      return null;
    }

    const expiresAt = Date.parse(railsMetadata.exp);
    if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
      return null;
    }
  }

  return parseUserId(readEnvelopeData(railsMetadata));
}

export function validateTransferLink(
  transferLink: string
): TransferLinkValidationResult {
  const signedId = extractSignedId(transferLink);
  if (!signedId) {
    return { ok: false, reason: "invalid" };
  }

  const secretKeyBase = getSecretKeyBase();
  if (!secretKeyBase) {
    return { ok: false, reason: "missing_secret" };
  }

  const userId = readSignedIdUserId(signedId, secretKeyBase);
  const userContext = userId ? getUserContextById(userId) : null;

  return userContext
    ? { ok: true, userContext }
    : { ok: false, reason: "invalid" };
}
