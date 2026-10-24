import { describe, expect, it, vi } from "vitest";
import { parseProviders } from "../src/config.js";
import createOAuth from "../src/index.js";
import type { SigrunHost } from "@sigrun/sigrun/extension";

const oidc = {
	id: "company",
	label: "Company",
	kind: "oidc",
	issuer: "https://id.example.invalid",
	clientId: "sigrun-client",
};

function hostWith(settings: Record<string, unknown>, secretGet = vi.fn()): SigrunHost {
	return {
		stores: {
			settings: { get: async () => settings, set: vi.fn() },
			secrets: { get: secretGet, set: vi.fn() },
			paths: { data: "", cache: "", state: "" },
		},
	} as unknown as SigrunHost;
}

describe("configuration", () => {
	it("parses an OIDC provider and applies defaults", () => {
		expect(parseProviders({ providers: [oidc] })).toEqual([
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
		expect(parseProviders({ providers: [
			{ id: "gh", label: "GitHub", kind: "oauth2", preset: "github", clientId: "gh-client" },
			{ id: "discord", label: "Discord", kind: "oauth2", preset: "discord", clientId: "discord-client" },
		] })).toHaveLength(2);
	});

	it("parses explicit endpoints, fields, and provisioning policy", () => {
		const [entry] = parseProviders({ providers: [{
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
		}] });
		expect(entry).toMatchObject({
			scopes: "openid profile email",
			policy: { autoProvision: true, allowedGroups: ["staff"], allowedDomains: ["example.invalid"] },
		});
	});

	it("skips only the malformed entry and warns once naming it", () => {
		const warnings: string[] = [];
		const result = parseProviders({ providers: [
			{ id: "broken", label: "Broken", kind: "oauth2", preset: "github" },
			oidc,
		] }, (message) => warnings.push(message));
		expect(result.map((entry) => entry.id)).toEqual(["company"]);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("broken");
	});

	it("reads a provider secret only through its scoped extension key", async () => {
		const secretGet = vi.fn().mockResolvedValue(undefined);
		const result = await createOAuth(hostWith({ providers: [oidc] }, secretGet));
		const provider = result.loginProviders![0];
		const flow = { state: "state", callbackUrl: "https://sigrun.example.invalid/callback", data: { nonce: "nonce", codeVerifier: "verifier" } };
		await expect(provider.complete(flow, { query: { code: "code", state: "state" } }, { abortSignal: undefined })).rejects.toThrow("missing its client secret");
		expect(secretGet).toHaveBeenCalledExactlyOnceWith("company.clientSecret");
	});

	it("returns no providers when settings are absent or empty", async () => {
		expect(parseProviders({})).toEqual([]);
		expect(parseProviders({ providers: [] })).toEqual([]);
		expect((await createOAuth(hostWith({}))).loginProviders).toEqual([]);
	});
});
