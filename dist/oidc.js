import * as oauth from "oauth4webapi";
function requestOptions(fetchImpl, ctx) {
    return { [oauth.customFetch]: fetchImpl, signal: ctx.abortSignal };
}
export async function discover(issuer, fetchImpl, ctx) {
    const identifier = new URL(issuer);
    return oauth.processDiscoveryResponse(identifier, await oauth.discoveryRequest(identifier, requestOptions(fetchImpl, ctx)));
}
export async function beginOidc(config, flow, ctx, fetchImpl) {
    const as = await discover(config.issuer, fetchImpl, ctx);
    if (as.authorization_endpoint === undefined) {
        throw new Error(`OIDC provider "${config.id}" has no authorization endpoint`);
    }
    const verifier = oauth.generateRandomCodeVerifier();
    const nonce = oauth.generateRandomNonce();
    flow.data.codeVerifier = verifier;
    flow.data.nonce = nonce;
    const url = new URL(as.authorization_endpoint);
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", flow.callbackUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", config.scopes);
    url.searchParams.set("state", flow.state);
    url.searchParams.set("code_challenge", await oauth.calculatePKCECodeChallenge(verifier));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("nonce", nonce);
    return { redirectUrl: url.toString() };
}
function stringClaim(claims, name) {
    const value = claims[name];
    if (value === undefined)
        return undefined;
    if (typeof value !== "string")
        throw new Error(`ID token claim ${name} is not a string`);
    return value;
}
function groupsClaim(claims, name) {
    const value = claims[name];
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value) || value.some((group) => typeof group !== "string")) {
        throw new Error(`ID token claim ${name} is not a string array`);
    }
    return value;
}
export function oidcResult(config, claims) {
    const username = stringClaim(claims, config.usernameClaim);
    const name = stringClaim(claims, "name");
    const email = stringClaim(claims, "email");
    const emailVerified = claims.email_verified;
    const groups = groupsClaim(claims, config.groupsClaim);
    if (emailVerified !== undefined && typeof emailVerified !== "boolean") {
        throw new Error("ID token claim email_verified is not boolean");
    }
    return {
        subject: stringClaim(claims, "sub"),
        profile: {
            ...(username === undefined ? {} : { username }),
            ...(name === undefined ? {} : { name }),
            ...(email === undefined ? {} : { email }),
            ...(emailVerified === undefined ? {} : { emailVerified }),
        },
        ...(groups === undefined ? {} : { groups }),
    };
}
export async function completeOidc(config, flow, callback, ctx, secret, fetchImpl) {
    if (secret === undefined || secret === "") {
        throw new Error(`OIDC provider "${config.id}" is missing its client secret`);
    }
    if (flow.data.codeVerifier === undefined || flow.data.nonce === undefined) {
        throw new Error("OIDC login flow is missing PKCE or nonce state");
    }
    const as = await discover(config.issuer, fetchImpl, ctx);
    if (as.jwks_uri === undefined) {
        throw new Error(`OIDC provider "${config.id}" has no JWKS endpoint`);
    }
    const client = { client_id: config.clientId };
    const parameters = oauth.validateAuthResponse(as, client, new URLSearchParams(callback.query), flow.state);
    const response = await oauth.authorizationCodeGrantRequest(as, client, oauth.ClientSecretPost(secret), parameters, flow.callbackUrl, flow.data.codeVerifier, requestOptions(fetchImpl, ctx));
    // oauth4webapi validates issuer, audience, expiry and the expected nonce.
    // Explicit JWKS validation below also requires a valid ID-token signature.
    const result = await oauth.processAuthorizationCodeResponse(as, client, response, {
        expectedNonce: flow.data.nonce,
        requireIdToken: true,
        ...requestOptions(fetchImpl, ctx),
    });
    const claims = oauth.getValidatedIdTokenClaims(result);
    if (claims === undefined || result.id_token === undefined) {
        throw new Error("OIDC token response has no ID token");
    }
    await oauth.validateApplicationLevelSignature(as, response, requestOptions(fetchImpl, ctx));
    return oidcResult(config, claims);
}
export function createOidcProvider(config, readSecret, fetchImpl = fetch) {
    return {
        id: config.id,
        label: config.label,
        ...(config.icon === undefined ? {} : { icon: config.icon }),
        ...(config.policy === undefined ? {} : { policy: config.policy }),
        begin: (flow, ctx) => beginOidc(config, flow, ctx, fetchImpl),
        complete: async (flow, callback, ctx) => completeOidc(config, flow, callback, ctx, await readSecret(), fetchImpl),
    };
}
