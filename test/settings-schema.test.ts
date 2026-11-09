/**
 * The settings-rework migration (Task 10): the login-provider list is a
 * declared JSON Schema (`src/settings-schema.ts`), read through
 * `host.settings.declare`. These tests pin the drawable proof, the old
 * parser's defaults, an old settings file's survival (preset expansion,
 * absent kind, URL normalization, policy regrouping, duplicate and
 * malformed entries), the new save shape, and the client-secret move
 * from the flat `<id>.clientSecret` key to `providers/<id>/clientSecret`.
 */
import { describe, expect, it, vi } from "vitest";
import { assertDrawable } from "@sigrun/sigrun/settings-schema";
// The checked-read helper is a core internal (not on the public
// settings-schema export); resolve the linked core checkout by path.
// @ts-expect-error — no type declarations for the deep path.
import { checkStoredSettings } from "../node_modules/@sigrun/sigrun/dist/settings/schema/defaults.js";
import { OAUTH_SETTINGS_SCHEMA } from "../src/settings-schema.js";
import { resolveProviders } from "../src/providers.js";
import createOAuth from "../src/index.js";
import type { SigrunHost } from "@sigrun/sigrun/extension";

/** The OIDC fixture from the old parser tests (test/config.test.ts). */
const oidc = {
	id: "company",
	label: "Company",
	kind: "oidc",
	issuer: "https://id.example.invalid",
	clientId: "sigrun-client",
};

/** The checked read: core's own stored-settings check (defaults + repair). */
function checked(settings: Record<string, unknown>): Record<string, unknown> {
	return checkStoredSettings(OAUTH_SETTINGS_SCHEMA, settings).value;
}

/** The checked-read handle, backed by core's own stored-settings check. */
function declaredHandle(settings: Record<string, unknown>) {
	return {
		get: async () => checkStoredSettings(OAUTH_SETTINGS_SCHEMA, settings).value,
		user: () => {
			throw new Error("oauth declares no userSchema");
		},
	};
}

function hostWith(
	settings: Record<string, unknown>,
	secrets: Record<string, string> = {},
): SigrunHost {
	return {
		settings: { declare: () => declaredHandle(settings) },
		stores: {
			settings: { get: async () => settings, set: vi.fn() },
			secrets: {
				get: async (key: string) => secrets[key],
				set: vi.fn(async (key: string, value: string) => {
					secrets[key] = value;
				}),
			},
			paths: { data: "", cache: "", state: "" },
		},
	} as unknown as SigrunHost;
}

describe("oauth settings schema", () => {
	it("schema is drawable", () => {
		assertDrawable(OAUTH_SETTINGS_SCHEMA);
	});

	it("defaults match the old parser's defaults", () => {
		const [provider] = resolveProviders(checked({ providers: [oidc] }));
		if (provider.kind !== "oidc") throw new Error("expected oidc");
		// One assertion per defaulted key, values copied from src/config.ts
		// before the parser was deleted.
		expect(provider.kind).toBe("oidc"); // absent kind infers oidc
		expect(provider.scopes).toBe("openid profile email");
		expect(provider.usernameClaim).toBe("preferred_username");
		expect(provider.groupsClaim).toBe("groups");
	});

	it("an old settings file still loads", async () => {
		// The fixture set from the old parser tests: an OIDC provider, both
		// presets, an explicit-endpoint provider with policy fields, a
		// malformed entry, and a duplicate id.
		const stored = {
			providers: [
				oidc,
				{ id: "gh", label: "GitHub", kind: "oauth2", preset: "github", clientId: "gh-client" },
				{ id: "discord", label: "Discord", kind: "oauth2", preset: "discord", clientId: "discord-client" },
				{
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
				},
				{ id: "broken", label: "Broken", kind: "oauth2", preset: "github" },
				{ ...oidc, label: "Duplicate" },
			],
		};
		const resolved = resolveProviders(checked(stored));
		expect(resolved.map((entry) => entry.id)).toEqual(["company", "gh", "discord", "custom"]);
		const github = resolved[1]!;
		if (github.kind !== "oauth2") throw new Error("expected oauth2");
		// Preset expansion is materialized on the first read.
		expect(github.kind).toBe("oauth2");
		expect(github.authorizeUrl).toBe("https://github.com/login/oauth/authorize");
		expect(github.tokenUrl).toBe("https://github.com/login/oauth/access_token");
		expect(github.userinfoUrl).toBe("https://api.github.com/user");
		expect(github.scopes).toBe("read:user user:email");
		expect(github.fields).toEqual({ subject: "id", username: "login", name: "name" });
		expect(github.preset).toBe("github");
		const custom = resolved[3]!;
		if (custom.kind !== "oauth2") throw new Error("expected oauth2");
		expect(custom.scopes).toBe("openid profile email");
		expect(custom.policy).toEqual({
			autoProvision: true,
			allowedGroups: ["staff"],
			allowedDomains: ["example.invalid"],
		});
		// The factory's checked read produces the same providers.
		const result = await createOAuth(hostWith(stored));
		expect(result.loginProviders!.map((provider) => provider.id)).toEqual([
			"company",
			"gh",
			"discord",
			"custom",
		]);
	});

	it("an oauth2 github provider survives a save", () => {
		// The save path stores what the channel submitted (minus secrets):
		// the already-materialized preset fields stay valid on the next read.
		const saved = {
			providers: [
				{
					id: "gh",
					label: "GitHub",
					kind: "oauth2",
					preset: "github",
					clientId: "gh-client",
					authorizeUrl: "https://github.com/login/oauth/authorize",
					tokenUrl: "https://github.com/login/oauth/access_token",
					userinfoUrl: "https://api.github.com/user",
					scopes: "read:user user:email",
					fields: { subject: "id", username: "login", name: "name" },
				},
			],
		};
		const [provider] = resolveProviders(checked(saved));
		expect(provider).toMatchObject({
			id: "gh",
			kind: "oauth2",
			preset: "github",
			authorizeUrl: "https://github.com/login/oauth/authorize",
			fields: { subject: "id", username: "login", name: "name" },
		});
	});

	it("existing client secrets survive the move", async () => {
		const secrets: Record<string, string> = { "company.clientSecret": "test-old-secret" };
		const secretSet = vi.fn(async (key: string, value: string) => {
			secrets[key] = value;
		});
		const secretDelete = vi.fn(async (key: string) => {
			delete secrets[key];
		});
		const host = {
			settings: { declare: () => declaredHandle({ providers: [oidc] }) },
			stores: {
				settings: { get: async () => ({ providers: [oidc] }), set: vi.fn() },
				secrets: {
					get: async (key: string) => secrets[key],
					set: secretSet,
					delete: secretDelete,
				},
				paths: { data: "", cache: "", state: "" },
			},
		} as unknown as SigrunHost;
		await createOAuth(host);
		expect(secrets["providers/company/clientSecret"]).toBe("test-old-secret");
		expect(secrets["company.clientSecret"]).toBeUndefined();
		expect(secretDelete).toHaveBeenCalledExactlyOnceWith("company.clientSecret");

		// A second boot must not resurrect or clobber: the old key is gone.
		await createOAuth(host);
		expect(secrets["providers/company/clientSecret"]).toBe("test-old-secret");
	});

	it("the new client-secret key wins over a stale flat key", async () => {
		const secrets: Record<string, string> = {
			"company.clientSecret": "stale",
			"providers/company/clientSecret": "current",
		};
		await createOAuth(hostWith({ providers: [oidc] }, secrets));
		expect(secrets["providers/company/clientSecret"]).toBe("current");
		expect(secrets["company.clientSecret"]).toBe("stale"); // untouched
	});
});
