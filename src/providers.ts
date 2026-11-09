/**
 * Turn the checked schema read into the runtime `ProviderConfig` list:
 * the old parser's per-kind requiredness and leniency (src/config.ts,
 * retired by the settings-rework migration) over the schema's already
 * defaulted entries. The schema replaces the parser's type checking and
 * fallback-to-default; what remains here is what JSON Schema's drawable
 * subset cannot express:
 *
 * - per-kind required fields (`issuer` for oidc; the endpoint set and
 *   `fields` for oauth2) — a missing one drops that entry with a
 *   warning, exactly as the parser did;
 * - URL validation (https, or http to a loopback host);
 * - preset expansion (github/discord endpoints, scopes, and field map,
 *   each used only where the entry does not carry its own);
 * - the issuer's trailing-slash strip;
 * - duplicate ids (the first wins, later duplicates warn and skip);
 * - the provisioning policy's grouping (`autoProvision` /
 *   `allowedGroups` / `allowedDomains` sit at the entry's top level in
 *   an old settings file; the runtime reads `policy`).
 */

import type { LoginProviderContribution } from "@sigrun/sigrun/extension";
import { githubPreset, discordPreset } from "./presets.js";
import type { ProviderEntry } from "./settings-schema.js";

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

/** The old parser's URL rule: https, or http to a loopback host. */
function validUrl(value: string | undefined): value is string {
	if (value === undefined) return false;
	try {
		const parsed = new URL(value);
		const loopback = ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
		return parsed.protocol === "https:" || (parsed.protocol === "http:" && loopback);
	} catch {
		return false;
	}
}

function policyOf(entry: ProviderEntry & Record<string, unknown>): ProvisioningPolicy | undefined {
	// The schema's titled `policy` group is authoritative once present;
	// the flat keys of an old settings file ride along as unknowns.
	if (entry.policy !== undefined) return entry.policy;
	const policy: ProvisioningPolicy = {};
	if (typeof entry.autoProvision === "boolean") policy.autoProvision = entry.autoProvision;
	if (Array.isArray(entry.allowedGroups)) policy.allowedGroups = entry.allowedGroups as string[];
	if (Array.isArray(entry.allowedDomains)) policy.allowedDomains = entry.allowedDomains as string[];
	return Object.keys(policy).length === 0 ? undefined : policy;
}

/** One entry to its runtime config, or undefined naming why it was skipped. */
export function resolveProvider(value: unknown): ProviderConfig {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("provider must be an object");
	}
	const entry = value as ProviderEntry & Record<string, unknown>;
	const base: Common & { policy?: ProvisioningPolicy } = {
		id: entry.id,
		label: entry.label,
		...(entry.icon === undefined ? {} : { icon: entry.icon }),
		...(policyOf(entry) === undefined ? {} : { policy: policyOf(entry) }),
	};
	if (entry.kind === "oidc") {
		if (!validUrl(entry.issuer)) throw new Error("issuer must be an HTTP(S) URL");
		return {
			...base,
			kind: "oidc",
			clientId: entry.clientId,
			issuer: entry.issuer.replace(/\/$/, ""),
			scopes: entry.scopes ?? DEFAULT_SCOPES,
			// The schema defaults fill on the checked read; these fallbacks keep
			// a direct (unchecked) resolve honest, and are identical values.
			usernameClaim: entry.usernameClaim ?? DEFAULT_USERNAME_CLAIM,
			groupsClaim: entry.groupsClaim ?? DEFAULT_GROUPS_CLAIM,
		};
	}
	if (entry.kind !== "oauth2") throw new Error("kind must be oidc or oauth2");
	const preset =
		entry.preset === "github" ? githubPreset() : entry.preset === "discord" ? discordPreset() : undefined;
	const authorizeUrl = entry.authorizeUrl ?? preset?.authorizeUrl;
	const tokenUrl = entry.tokenUrl ?? preset?.tokenUrl;
	const userinfoUrl = entry.userinfoUrl ?? preset?.userinfoUrl;
	if (!validUrl(authorizeUrl)) throw new Error("authorizeUrl must be an HTTP(S) URL");
	if (!validUrl(tokenUrl)) throw new Error("tokenUrl must be an HTTP(S) URL");
	if (!validUrl(userinfoUrl)) throw new Error("userinfoUrl must be an HTTP(S) URL");
	const fields = entry.fields ?? preset?.fields;
	if (fields === undefined || typeof fields.subject !== "string" || fields.subject.length === 0) {
		throw new Error("fields.subject must be a non-empty string");
	}
	// The schema fills `scopes` with the OIDC default on the checked read;
	// a preset's own scopes win over that default (the old parser's
	// `value.scopes ?? endpoints.scopes` precedence), while an explicit
	// non-default value is the operator's and stays.
	const scopes =
		preset !== undefined && (entry.scopes === undefined || entry.scopes === DEFAULT_SCOPES)
			? preset.scopes
			: (entry.scopes ?? preset?.scopes ?? DEFAULT_SCOPES);
	return {
		...base,
		kind: "oauth2",
		clientId: entry.clientId,
		authorizeUrl,
		tokenUrl,
		userinfoUrl,
		scopes,
		fields,
		...(entry.preset === undefined ? {} : { preset: entry.preset }),
	};
}

/**
 * The provider list from one settings object: each entry resolved
 * independently, a malformed or duplicate entry dropped with a warning
 * (the old parser's leniency, now on top of the schema's checked read).
 */
export function resolveProviders(
	settings: Record<string, unknown>,
	warn: Warning = console.warn,
): ProviderConfig[] {
	if (!Array.isArray(settings.providers)) return [];
	const providers: ProviderConfig[] = [];
	const ids = new Set<string>();
	for (const value of settings.providers) {
		const name =
			typeof value === "object" && value !== null && "id" in value && typeof value.id === "string"
				? value.id
				: "unnamed";
		try {
			const provider = resolveProvider(value);
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
