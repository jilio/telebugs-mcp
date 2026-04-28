import type { Express, Request, Response } from "express";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  getUserContextById,
  validateApiKey,
  validatePasswordCredentials,
  type UserContext,
} from "./auth";
import {
  renderOAuthAuthorizePage,
  type OAuthAuthorizePageParams,
} from "./ui/oauth-page";
import { validateTransferLink } from "./transfer-link";

const CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TOKEN_TTL_SECONDS = parseInt(
  process.env.OAUTH_ACCESS_TOKEN_TTL_SECONDS ?? "43200",
  10
);
const LOGIN_RATE_LIMIT_WINDOW_MS = 3 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 10;
const SUPPORTED_SCOPES = ["telebugs.read", "telebugs.write"] as const;
const DEFAULT_SCOPE = SUPPORTED_SCOPES.join(" ");

interface OAuthClient {
  clientId: string;
  redirectUris: string[];
  clientName?: string;
  createdAt: number;
}

interface AuthorizationCode {
  userId: number;
  clientId: string;
  redirectUri: string;
  resource: string;
  codeChallenge: string;
  codeChallengeMethod: "S256" | "plain";
  scope: string;
  expiresAt: number;
}

interface AccessToken {
  userId: number;
  clientId: string;
  resource: string;
  scope: string;
  expiresAt: number;
}

type AuthorizeParams = OAuthAuthorizePageParams;

const clients = new Map<string, OAuthClient>();
const authorizationCodes = new Map<string, AuthorizationCode>();
const accessTokens = new Map<string, AccessToken>();
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function pruneExpiredTokens() {
  const now = Date.now();

  for (const [code, authorizationCode] of authorizationCodes) {
    if (authorizationCode.expiresAt <= now) {
      authorizationCodes.delete(code);
    }
  }

  for (const [token, accessToken] of accessTokens) {
    if (accessToken.expiresAt <= now) {
      accessTokens.delete(token);
    }
  }
}

function getSingleParam(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return undefined;
}

function getBaseUrl(req: Request): string {
  const configuredBaseUrl = process.env.MCP_BASE_URL ?? process.env.PUBLIC_URL;
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  const forwardedProto = getSingleParam(req.headers["x-forwarded-proto"]);
  const forwardedHost = getSingleParam(req.headers["x-forwarded-host"]);
  const protocol = forwardedProto?.split(",")[0]?.trim() || req.protocol;
  const host = forwardedHost?.split(",")[0]?.trim() || req.get("host");

  return `${protocol}://${host}`;
}

export function getMcpResource(req: Request): string {
  return `${getBaseUrl(req)}/mcp`;
}

function getProtectedResourceMetadataUrl(req: Request): string {
  return `${getBaseUrl(req)}/.well-known/oauth-protected-resource/mcp`;
}

export function setOAuthChallenge(req: Request, res: Response) {
  res.setHeader(
    "WWW-Authenticate",
    `Bearer realm="telebugs-mcp", resource_metadata="${getProtectedResourceMetadataUrl(req)}", scope="${DEFAULT_SCOPE}"`
  );
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7);
}

function normalizeResourceUri(uri: string): string | null {
  try {
    const parsed = new URL(uri);
    if (parsed.hash) {
      return null;
    }

    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function resourcesMatch(actual: string, expected: string): boolean {
  const normalizedActual = normalizeResourceUri(actual);
  const normalizedExpected = normalizeResourceUri(expected);

  return Boolean(
    normalizedActual &&
      normalizedExpected &&
      normalizedActual === normalizedExpected
  );
}

function parseAbsoluteUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isValidRedirectUri(uri: string): boolean {
  return parseAbsoluteUrl(uri) !== null;
}

function getClientDisplayName(client: OAuthClient): string {
  return client.clientName?.trim() || "Unknown MCP client";
}

function getRedirectDisplayOrigin(redirectUri: string): string {
  return parseAbsoluteUrl(redirectUri)?.origin ?? redirectUri;
}

export function validateOAuthAccessToken(
  token: string,
  expectedResource?: string
): UserContext | null {
  pruneExpiredTokens();

  const accessToken = accessTokens.get(token);
  if (!accessToken) {
    return null;
  }

  if (expectedResource && !resourcesMatch(accessToken.resource, expectedResource)) {
    return null;
  }

  return getUserContextById(accessToken.userId);
}

export function validateBearerToken(
  token: string,
  expectedResource?: string
): UserContext | null {
  return validateOAuthAccessToken(token, expectedResource) ?? validateApiKey(token);
}

function noStore(res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
}

function jsonNoStore(res: Response, status: number, body: unknown) {
  noStore(res);
  res.status(status).json(body);
}

function oauthError(
  res: Response,
  status: number,
  error: string,
  description?: string
) {
  jsonNoStore(res, status, {
    error,
    ...(description ? { error_description: description } : {}),
  });
}

function isLoginRateLimited(req: Request): boolean {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const attempt = loginAttempts.get(key);

  if (!attempt || attempt.resetAt <= now) {
    loginAttempts.set(key, {
      count: 1,
      resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }

  attempt.count += 1;
  return attempt.count > LOGIN_RATE_LIMIT_MAX_ATTEMPTS;
}

function normalizeScope(scope: string | undefined): string | null {
  if (!scope) {
    return DEFAULT_SCOPE;
  }

  const requestedScopes = scope.split(/\s+/).filter(Boolean);
  if (requestedScopes.some((requested) => !SUPPORTED_SCOPES.includes(requested as typeof SUPPORTED_SCOPES[number]))) {
    return null;
  }

  return requestedScopes.length > 0 ? requestedScopes.join(" ") : DEFAULT_SCOPE;
}

function isRedirectUriAllowed(clientId: string, redirectUri: string): boolean {
  const registeredClient = clients.get(clientId);

  return Boolean(registeredClient?.redirectUris.includes(redirectUri));
}

function parseAuthorizeParams(
  req: Request,
  input: Record<string, unknown>
): AuthorizeParams | string {
  const responseType = getSingleParam(input.response_type);
  const clientId = getSingleParam(input.client_id);
  const redirectUri = getSingleParam(input.redirect_uri);
  const resource = getSingleParam(input.resource);
  const state = getSingleParam(input.state);
  const codeChallenge = getSingleParam(input.code_challenge);
  const codeChallengeMethod = getSingleParam(input.code_challenge_method) ?? "plain";
  const scope = normalizeScope(getSingleParam(input.scope));

  if (responseType !== "code") {
    return "Only authorization-code response_type is supported.";
  }

  if (!clientId) {
    return "Missing client_id.";
  }

  if (!redirectUri) {
    return "Missing redirect_uri.";
  }

  if (!isRedirectUriAllowed(clientId, redirectUri)) {
    return "redirect_uri is not registered or allowed.";
  }

  if (!resource) {
    return "Missing resource.";
  }

  if (!resourcesMatch(resource, getMcpResource(req))) {
    return "resource does not match this MCP server.";
  }

  if (!codeChallenge) {
    return "Missing PKCE code_challenge.";
  }

  if (codeChallengeMethod !== "S256" && codeChallengeMethod !== "plain") {
    return "Unsupported PKCE code_challenge_method.";
  }

  if (!scope) {
    return "Unsupported OAuth scope requested.";
  }

  const registeredClient = clients.get(clientId);
  if (!registeredClient) {
    return "Unknown client_id.";
  }

  return {
    responseType,
    clientId,
    redirectUri,
    resource,
    state,
    codeChallenge,
    codeChallengeMethod,
    scope,
    clientName: getClientDisplayName(registeredClient),
    redirectOrigin: getRedirectDisplayOrigin(redirectUri),
  };
}

function redirectWithCode(params: AuthorizeParams, userContext: UserContext, res: Response) {
  pruneExpiredTokens();

  const code = randomToken();
  authorizationCodes.set(code, {
    userId: userContext.user.id,
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    resource: params.resource,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod,
    scope: params.scope,
    expiresAt: Date.now() + CODE_TTL_MS,
  });

  const redirectUrl = new URL(params.redirectUri);
  redirectUrl.searchParams.set("code", code);
  if (params.state) {
    redirectUrl.searchParams.set("state", params.state);
  }

  noStore(res);
  res.redirect(302, redirectUrl.toString());
}

function verifyPkce(
  codeVerifier: string,
  codeChallenge: string,
  codeChallengeMethod: "S256" | "plain"
): boolean {
  const expected =
    codeChallengeMethod === "S256"
      ? createHash("sha256").update(codeVerifier).digest("base64url")
      : codeVerifier;

  const expectedBytes = Buffer.from(expected);
  const challengeBytes = Buffer.from(codeChallenge);

  return (
    expectedBytes.length === challengeBytes.length &&
    timingSafeEqual(expectedBytes, challengeBytes)
  );
}

export function registerOAuthRoutes(app: Express) {
  app.get(["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"], (req, res) => {
    const baseUrl = getBaseUrl(req);

    jsonNoStore(res, 200, {
      resource: getMcpResource(req),
      authorization_servers: [baseUrl],
      bearer_methods_supported: ["header"],
      scopes_supported: SUPPORTED_SCOPES,
      resource_name: "Telebugs MCP",
    });
  });

  app.get(["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"], (req, res) => {
    const baseUrl = getBaseUrl(req);

    jsonNoStore(res, 200, {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256", "plain"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: SUPPORTED_SCOPES,
    });
  });

  app.post("/oauth/register", (req, res) => {
    const redirectUris = req.body?.redirect_uris;
    if (
      !Array.isArray(redirectUris) ||
      redirectUris.length === 0 ||
      redirectUris.some(
        (uri) => typeof uri !== "string" || !isValidRedirectUri(uri)
      )
    ) {
      oauthError(
        res,
        400,
        "invalid_client_metadata",
        "redirect_uris must be a non-empty array of absolute URIs."
      );
      return;
    }

    const clientId = `mcp_client_${randomToken(18)}`;
    const client: OAuthClient = {
      clientId,
      redirectUris,
      clientName:
        typeof req.body?.client_name === "string" ? req.body.client_name : undefined,
      createdAt: Math.floor(Date.now() / 1000),
    };
    clients.set(clientId, client);

    jsonNoStore(res, 201, {
      client_id: client.clientId,
      client_id_issued_at: client.createdAt,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
  });

  app.get("/oauth/authorize", (req, res) => {
    const parsedParams = parseAuthorizeParams(req, req.query as Record<string, unknown>);
    if (typeof parsedParams === "string") {
      res.status(400).send(parsedParams);
      return;
    }

    noStore(res);
    res.type("html").send(renderOAuthAuthorizePage(parsedParams));
  });

  app.post("/oauth/authorize", async (req, res) => {
    const parsedParams = parseAuthorizeParams(req, req.body as Record<string, unknown>);
    if (typeof parsedParams === "string") {
      res.status(400).send(parsedParams);
      return;
    }

    const approvedClient = getSingleParam(req.body?.approve) === "true";
    if (!approvedClient) {
      noStore(res);
      res
        .status(400)
        .type("html")
        .send(
          renderOAuthAuthorizePage(
            parsedParams,
            "Review the client details and approve access before continuing."
          )
        );
      return;
    }

    if (isLoginRateLimited(req)) {
      noStore(res);
      res
        .status(429)
        .type("html")
        .send(renderOAuthAuthorizePage(parsedParams, "Too many sign-in attempts. Try again later."));
      return;
    }

    const emailAddress =
      typeof req.body?.email_address === "string" ? req.body.email_address.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const transferLink =
      typeof req.body?.transfer_link === "string" ? req.body.transfer_link.trim() : "";

    let userContext: UserContext | null = null;
    let errorMessage = "Invalid Telebugs credentials.";

    if (transferLink) {
      const transferLinkResult = validateTransferLink(transferLink);

      if (transferLinkResult.ok) {
        userContext = transferLinkResult.userContext;
      } else {
        errorMessage =
          transferLinkResult.reason === "missing_secret"
            ? "Sign-in links are not configured on this MCP server."
            : "Invalid or expired Telebugs sign-in link.";
      }
    } else if (emailAddress && password) {
      userContext = await validatePasswordCredentials(emailAddress, password);
    } else {
      errorMessage = "Enter your Telebugs password or sign-in link.";
    }

    if (!userContext) {
      noStore(res);
      res
        .status(401)
        .type("html")
        .send(renderOAuthAuthorizePage(parsedParams, errorMessage));
      return;
    }

    redirectWithCode(parsedParams, userContext, res);
  });

  app.post("/oauth/token", (req, res) => {
    pruneExpiredTokens();

    const grantType = getSingleParam(req.body?.grant_type);
    const code = getSingleParam(req.body?.code);
    const redirectUri = getSingleParam(req.body?.redirect_uri);
    const resource = getSingleParam(req.body?.resource);
    const clientId = getSingleParam(req.body?.client_id);
    const codeVerifier = getSingleParam(req.body?.code_verifier);

    if (grantType !== "authorization_code") {
      oauthError(res, 400, "unsupported_grant_type");
      return;
    }

    if (!code || !redirectUri || !resource || !clientId || !codeVerifier) {
      oauthError(res, 400, "invalid_request", "code, redirect_uri, resource, client_id, and code_verifier are required.");
      return;
    }

    const authorizationCode = authorizationCodes.get(code);
    authorizationCodes.delete(code);

    if (!authorizationCode || authorizationCode.expiresAt <= Date.now()) {
      oauthError(res, 400, "invalid_grant", "Authorization code is invalid or expired.");
      return;
    }

    if (
      authorizationCode.redirectUri !== redirectUri ||
      authorizationCode.clientId !== clientId ||
      !resourcesMatch(resource, authorizationCode.resource) ||
      !verifyPkce(
        codeVerifier,
        authorizationCode.codeChallenge,
        authorizationCode.codeChallengeMethod
      )
    ) {
      oauthError(res, 400, "invalid_grant", "Authorization code validation failed.");
      return;
    }

    const accessToken = randomToken(48);
    accessTokens.set(accessToken, {
      userId: authorizationCode.userId,
      clientId,
      resource: authorizationCode.resource,
      scope: authorizationCode.scope,
      expiresAt: Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
    });

    jsonNoStore(res, 200, {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      scope: authorizationCode.scope,
    });
  });
}
