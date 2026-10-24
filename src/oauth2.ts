import * as oauth from "oauth4webapi";
import type { HandlerContext, LoginFlow, LoginProviderContribution, LoginResult } from "@sigrun/sigrun/extension";
import type { Oauth2Config } from "./config.js";
import type { Fetch, SecretReader } from "./oidc.js";

function field(value: unknown, path: string): unknown {
	let current = value;
	for (const part of path.split(".")) {
		if (typeof current !== "object" || current === null || Array.isArray(current)) return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

function stringField(value: unknown, path: string | undefined): string | undefined {
	if (path === undefined) return undefined;
	const result = field(value, path);
	if (result === undefined || result === null) return undefined;
	if (typeof result === "string") return result;
	if (typeof result === "number" && Number.isFinite(result)) return String(result);
	throw new Error(`OAuth 2 userinfo field ${path} is not a string or number`);
}

function booleanField(value: unknown, path: string | undefined): boolean | undefined {
	if (path === undefined) return undefined;
	const result = field(value, path);
	if (result === undefined) return undefined;
	if (typeof result !== "boolean") throw new Error(`OAuth 2 userinfo field ${path} is not boolean`);
	return result;
}

export function mapUserinfo(config: Oauth2Config, userinfo: unknown): LoginResult {
	const subject = stringField(userinfo, config.fields.subject);
	if (subject === undefined || subject === "") throw new Error("OAuth 2 userinfo subject is missing");
	const groups = config.fields.groups === undefined ? undefined : field(userinfo, config.fields.groups);
	if (groups !== undefined && (!Array.isArray(groups) || groups.some((group) => typeof group !== "string"))) throw new Error("OAuth 2 groups field is not a string array");
	return {
		subject,
		profile: {
			...(stringField(userinfo, config.fields.username) === undefined ? {} : { username: stringField(userinfo, config.fields.username) }),
			...(stringField(userinfo, config.fields.name) === undefined ? {} : { name: stringField(userinfo, config.fields.name) }),
			...(stringField(userinfo, config.fields.email) === undefined ? {} : { email: stringField(userinfo, config.fields.email) }),
			...(booleanField(userinfo, config.fields.emailVerified) === undefined ? {} : { emailVerified: booleanField(userinfo, config.fields.emailVerified) }),
		},
		...(groups === undefined ? {} : { groups: groups as string[] }),
	};
}

async function githubEmail(accessToken: string, fetchImpl: Fetch, signal: AbortSignal | undefined): Promise<{ email?: string; emailVerified?: boolean }> {
	const response = await fetchImpl("https://api.github.com/user/emails", {
		headers: { authorization: `Bearer ${accessToken}`, accept: "application/vnd.github+json" },
		signal,
	});
	if (!response.ok) throw new Error(`GitHub email lookup failed (${response.status})`);
	const entries: unknown = await response.json();
	if (!Array.isArray(entries)) throw new Error("GitHub email response is not an array");
	const primary = entries.find((entry) => typeof entry === "object" && entry !== null && (entry as Record<string, unknown>).primary === true && (entry as Record<string, unknown>).verified === true);
	if (primary === undefined) return { emailVerified: false };
	const email = (primary as Record<string, unknown>).email;
	if (typeof email !== "string") throw new Error("GitHub primary verified email is not a string");
	return { email, emailVerified: true };
}

export async function beginOauth2(config: Oauth2Config, flow: LoginFlow): Promise<{ redirectUrl: string }> {
	const verifier = oauth.generateRandomCodeVerifier();
	flow.data.codeVerifier = verifier;
	const url = new URL(config.authorizeUrl);
	url.searchParams.set("client_id", config.clientId);
	url.searchParams.set("redirect_uri", flow.callbackUrl);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("scope", config.scopes);
	url.searchParams.set("state", flow.state);
	url.searchParams.set("code_challenge", await oauth.calculatePKCECodeChallenge(verifier));
	url.searchParams.set("code_challenge_method", "S256");
	return { redirectUrl: url.toString() };
}

export async function completeOauth2(config: Oauth2Config, flow: LoginFlow, callback: { query: Record<string, string> }, ctx: HandlerContext, secret: string | undefined, fetchImpl: Fetch): Promise<LoginResult> {
	if (secret === undefined || secret === "") throw new Error(`OAuth 2 provider "${config.id}" is missing its client secret`);
	if (flow.data.codeVerifier === undefined) throw new Error("OAuth 2 login flow is missing PKCE state");
	const as: oauth.AuthorizationServer = { issuer: config.authorizeUrl, token_endpoint: config.tokenUrl };
	const client: oauth.Client = { client_id: config.clientId };
	const parameters = oauth.validateAuthResponse(as, client, new URLSearchParams(callback.query), flow.state);
	const response = await oauth.authorizationCodeGrantRequest(as, client, oauth.ClientSecretPost(secret), parameters, flow.callbackUrl, flow.data.codeVerifier, { [oauth.customFetch]: fetchImpl, signal: ctx.abortSignal });
	const token = await oauth.processAuthorizationCodeResponse(as, client, response);
	const accessToken = token.access_token;
	if (typeof accessToken !== "string") throw new Error("OAuth 2 token response has no access token");
	const userinfoResponse = await fetchImpl(config.userinfoUrl, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" }, signal: ctx.abortSignal });
	if (!userinfoResponse.ok) throw new Error(`OAuth 2 userinfo request failed (${userinfoResponse.status})`);
	const result = mapUserinfo(config, await userinfoResponse.json());
	if (config.preset === "github") return { ...result, profile: { ...result.profile, ...(await githubEmail(accessToken, fetchImpl, ctx.abortSignal)) } };
	return result;
}

export function createOauth2Provider(config: Oauth2Config, readSecret: SecretReader, fetchImpl: Fetch = fetch): LoginProviderContribution {
	return {
		id: config.id,
		label: config.label,
		...(config.icon === undefined ? {} : { icon: config.icon }),
		...(config.policy === undefined ? {} : { policy: config.policy }),
		begin: (flow) => beginOauth2(config, flow),
		complete: async (flow, callback, ctx) => completeOauth2(config, flow, callback, ctx, await readSecret(), fetchImpl),
	};
}
