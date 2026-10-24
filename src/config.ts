import type { LoginProviderContribution } from "@sigrun/sigrun/extension";
import { githubPreset, discordPreset } from "./presets.js";

export const DEFAULT_SCOPES = "openid profile email";
export const DEFAULT_USERNAME_CLAIM = "preferred_username";
export const DEFAULT_GROUPS_CLAIM = "groups";

export interface ProvisioningPolicy {
	autoProvision?: boolean;
	allowedGroups?: string[];
	allowedDomains?: string[];
}

interface Common {
	id: string;
	label: string;
	icon?: string;
	policy?: ProvisioningPolicy;
}

export interface OidcConfig extends Common {
	kind: "oidc";
	issuer: string;
	clientId: string;
	scopes: string;
	usernameClaim: string;
	groupsClaim: string;
}

export interface FieldMap {
	subject: string;
	username?: string;
	name?: string;
	email?: string;
	emailVerified?: string;
	groups?: string;
}

export interface Oauth2Config extends Common {
	kind: "oauth2";
	clientId: string;
	authorizeUrl: string;
	tokenUrl: string;
	userinfoUrl: string;
	scopes: string;
	fields: FieldMap;
	preset?: "github" | "discord";
}

export type ProviderConfig = (OidcConfig | Oauth2Config) & { policy?: ProvisioningPolicy };
export type Warning = (message: string) => void;

type UnknownRecord = Record<string, unknown>;

function object(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function string(entry: UnknownRecord, key: string, required = true): string | undefined {
	const value = entry[key];
	if (value === undefined && !required) return undefined;
	if (typeof value !== "string" || value.length === 0) throw new Error(`${key} must be a non-empty string`);
	return value;
}

function url(entry: UnknownRecord, key: string): string {
	const value = string(entry, key);
	try {
		const parsed = new URL(value!);
		const loopback = ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
		if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) throw new Error();
		return value!;
	} catch {
		throw new Error(`${key} must be an HTTP(S) URL`);
	}
}

function strings(value: unknown, key: string): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) throw new Error(`${key} must be an array of non-empty strings`);
	return value as string[];
}

function policy(entry: UnknownRecord): ProvisioningPolicy | undefined {
	const result: ProvisioningPolicy = {};
	if (entry.autoProvision !== undefined) {
		if (typeof entry.autoProvision !== "boolean") throw new Error("autoProvision must be boolean");
		result.autoProvision = entry.autoProvision;
	}
	result.allowedGroups = strings(entry.allowedGroups, "allowedGroups");
	result.allowedDomains = strings(entry.allowedDomains, "allowedDomains");
	return Object.keys(result).length === 0 ? undefined : result;
}

function common(entry: UnknownRecord): Common & { policy?: ProvisioningPolicy } {
	const id = string(entry, "id")!;
	if (!/^[a-z0-9][a-z0-9._-]*$/.test(id)) throw new Error("id is invalid");
	return {
		id,
		label: string(entry, "label")!,
		...(entry.icon === undefined ? {} : { icon: string(entry, "icon")! }),
		...(policy(entry) === undefined ? {} : { policy: policy(entry) }),
	};
}

function scopes(entry: UnknownRecord): string {
	return string(entry, "scopes", false) ?? DEFAULT_SCOPES;
}

function fields(value: unknown): FieldMap {
	if (!object(value)) throw new Error("fields must be an object");
	const result: FieldMap = { subject: string(value, "subject")! };
	for (const key of ["username", "name", "email", "emailVerified", "groups"] as const) {
		const field = string(value, key, false);
		if (field !== undefined) result[key] = field;
	}
	return result;
}

export function parseProvider(value: unknown): ProviderConfig {
	if (!object(value)) throw new Error("provider must be an object");
	const base = common(value);
	const clientId = string(value, "clientId")!;
	if (value.kind === "oidc") {
		return {
			...base,
			kind: "oidc",
			clientId,
			issuer: url(value, "issuer").replace(/\/$/, ""),
			scopes: scopes(value),
			usernameClaim: string(value, "usernameClaim", false) ?? DEFAULT_USERNAME_CLAIM,
			groupsClaim: string(value, "groupsClaim", false) ?? DEFAULT_GROUPS_CLAIM,
		};
	}
	if (value.kind !== "oauth2") throw new Error("kind must be oidc or oauth2");
	let endpoints: UnknownRecord;
	let preset: "github" | "discord" | undefined;
	if (value.preset !== undefined) {
		if (value.preset !== "github" && value.preset !== "discord") throw new Error("unknown oauth2 preset");
		preset = value.preset;
		endpoints = { ...(preset === "github" ? githubPreset() : discordPreset()) };
	} else {
		endpoints = value;
	}
	return {
		...base,
		kind: "oauth2",
		clientId,
		authorizeUrl: url(endpoints, "authorizeUrl"),
		tokenUrl: url(endpoints, "tokenUrl"),
		userinfoUrl: url(endpoints, "userinfoUrl"),
		scopes: scopes({ scopes: value.scopes ?? endpoints.scopes }),
		fields: fields(value.fields ?? endpoints.fields),
		...(preset === undefined ? {} : { preset }),
	};
}

export function parseProviders(settings: Record<string, unknown>, warn: Warning = console.warn): ProviderConfig[] {
	if (settings.providers === undefined) return [];
	if (!Array.isArray(settings.providers)) {
		warn("oauth: settings providers is not an array; no login providers loaded");
		return [];
	}
	const providers: ProviderConfig[] = [];
	const ids = new Set<string>();
	for (const value of settings.providers) {
		const name = object(value) && typeof value.id === "string" ? value.id : "unnamed";
		try {
			const provider = parseProvider(value);
			if (ids.has(provider.id)) {
				warn(`oauth: skipping duplicate provider "${provider.id}"`);
				continue;
			}
			ids.add(provider.id);
			providers.push(provider);
		} catch (error) {
			warn(`oauth: skipping malformed provider "${name}": ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return providers;
}

export function contributionPolicy(config: ProviderConfig): LoginProviderContribution["policy"] {
	return config.policy;
}
