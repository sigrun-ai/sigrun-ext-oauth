/**
 * The provider-resolution tests (formerly the parser tests of
 * src/config.ts): the schema checked read supplies the defaults, so
 * these drive `resolveProviders` through core's `checkStoredSettings`
 * exactly as the factory's `declared.get()` does.
 */
import { describe, expect, it, vi } from "vitest";
import { OAUTH_SETTINGS_SCHEMA } from "../src/settings-schema.js";
import { resolveProviders } from "../src/providers.js";
import createOAuth from "../src/index.js";
import type { SigrunHost } from "@sigrun/sigrun/extension";
import { checkStoredSettings } from "@sigrun/sigrun/settings-schema";

const oidc = {
	id: "company",
	label: "Company",
	kind: "oidc",
	issuer: "https://id.example.invalid",
	clientId: "sigrun-client",
};

function checked(settings: Record<string, unknown>): Record<string, unknown> {
	return checkStoredSettings(OAUTH_SETTINGS_SCHEMA, settings).value;
}

/** The repairs core's checked read reports (the schema's warn-and-continue). */
function repairsOf(settings: Record<string, unknown>): readonly { path: string; action: string }[] {
	return checkStoredSettings(OAUTH_SETTINGS_SCHEMA, settings).repairs;
}

function declaredHandle(settings: Record<string, unknown>) {
	return {
		get: async () => checked(settings),
		user: () => {
			throw new Error("oauth declares no userSchema");
		},
	};
}

function hostWith(settings: Record<string, unknown>, secretGet = vi.fn()): SigrunHost {
	return {
		settings: { declare: () => declaredHandle(settings) },
		stores: {
			settings: { get: async () => settings, set: vi.fn() },
			secrets: { get: secretGet, set: vi.fn(), delete: vi.fn() },
			paths: { data: "", cache: "", state: "" },
		},
	} as unknown as SigrunHost;
}

describe("configuration", () => {
	it("parses an OIDC provider and applies defaults", () => {
		expect(resolveProviders(checked({ providers: [oidc] }))).toEqual([
			expect.objectContaining({
				id: "company",
				kind: "oidc",
				scopes: "openid profile email",
				usernameClaim: "preferred_username",
				groupsClaim: "groups",
			}),
		]);
	});

	it("parses both OAuth 2 presets", () => {
		expect(resolveProviders(checked({ providers: [
			{ id: "gh", label: "GitHub", kind: "oauth2", preset: "github", clientId: "gh-client" },
			{ id: "discord", label: "Discord", kind: "oauth2", preset: "discord", clientId: "discord-client" },
		] }))).toHaveLength(2);
	});

	it("parses explicit endpoints, fields, and provisioning policy", () => {
		const [entry] = resolveProviders(checked({ providers: [{
			id: "custom",
			label: "Custom",
			kind: "oauth2",
			clientId: "custom-client",
			authorizeUrl: "https://id.example.invalid/authorize",
			tokenUrl: "https://id.example.invalid/token",
			userinfoUrl: "https://id.example.invalid/me",
			fields: { subject: "user.id", groups: "user.roles" },
			autoProvision: true,
			allowedGroups: ["staff"],
			allowedDomains: ["example.invalid"],
		}] }));
		expect(entry).toMatchObject({
			scopes: "openid profile email",
			policy: { autoProvision: true, allowedGroups: ["staff"], allowedDomains: ["example.invalid"] },
		});
	});

	it("drops only the malformed entry, named in the checked read's repairs", () => {
		const stored = { providers: [
			{ id: "broken", label: "Broken", kind: "oauth2", preset: "github" },
			oidc,
		] };
		const result = resolveProviders(checked(stored));
		expect(result.map((entry) => entry.id)).toEqual(["company"]);
		// The old parser's warn-and-skip is now the schema's drop, reported
		// through the checked read's repair list (core logs and notices it).
		expect(repairsOf(stored).some((repair) => repair.path.startsWith("/providers/0"))).toBe(true);
	});

	it("skips duplicate ids without suppressing the first or other providers", () => {
		const warnings: string[] = [];
		const result = resolveProviders(checked({ providers: [
			oidc,
			{ ...oidc, label: "Duplicate" },
			{ id: "other", label: "Other", kind: "oidc", issuer: "https://other.example.invalid", clientId: "other-client" },
		] }), (message) => warnings.push(message));
		expect(result.map((entry) => [entry.id, entry.label])).toEqual([["company", "Company"], ["other", "Other"]]);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("company");
		expect(warnings[0]).toContain("duplicate");
	});

	it("drops an explicit OAuth 2 provider missing clientId without suppressing others", () => {
		const stored = { providers: [
			{
				id: "explicit-broken", label: "Broken explicit", kind: "oauth2",
				authorizeUrl: "https://id.example.invalid/authorize",
				tokenUrl: "https://id.example.invalid/token",
				userinfoUrl: "https://id.example.invalid/me",
				fields: { subject: "id" },
			},
			oidc,
		] };
		const result = resolveProviders(checked(stored));
		expect(result.map((entry) => entry.id)).toEqual(["company"]);
		expect(repairsOf(stored).some((repair) => repair.path.startsWith("/providers/0"))).toBe(true);
	});

	it("reads a provider secret only through its scoped extension key", async () => {
		const secretGet = vi.fn().mockResolvedValue(undefined);
		const result = await createOAuth(hostWith({ providers: [oidc] }, secretGet));
		const provider = result.loginProviders![0];
		const flow = { state: "state", callbackUrl: "https://sigrun.example.invalid/callback", data: { nonce: "nonce", codeVerifier: "verifier" } };
		await expect(provider.complete(flow, { query: { code: "code", state: "state" } }, { abortSignal: undefined })).rejects.toThrow("missing its client secret");
		// The flow's secret read is the new nested key only; the factory's
		// one-time migration may probe the legacy key, but the flow never
		// reads it. The flow read is the LAST secrets.get call.
		expect(secretGet.mock.calls.at(-1)).toEqual(["providers/company/clientSecret"]);
	});

	it("returns no providers when settings are absent or empty", async () => {
		expect(resolveProviders(checked({}))).toEqual([]);
		expect(resolveProviders(checked({ providers: [] }))).toEqual([]);
		expect((await createOAuth(hostWith({}))).loginProviders).toEqual([]);
	});
});
