import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOidcProvider } from "../src/oidc.js";
import { TestIssuer } from "./issuer.js";
import type { LoginFlow } from "@sigrun/sigrun/extension";

const issuer = new TestIssuer();
const context = { abortSignal: undefined };

beforeAll(() => issuer.start());
afterAll(() => issuer.stop());

function config() {
	return {
		id: "company", label: "Company", kind: "oidc" as const,
		issuer: issuer.issuer, clientId: "sigrun-client",
		scopes: "openid profile email", usernameClaim: "preferred_username", groupsClaim: "groups",
	};
}

async function flow(): Promise<LoginFlow> {
	const value: LoginFlow = { state: "state-123", callbackUrl: "https://sigrun.example.invalid/callback", data: {} };
	const { redirectUrl } = await createOidcProvider(config(), async () => "test-client-secret", issuer.fetch).begin(value, context);
	const redirect = new URL(redirectUrl);
	expect(redirect.searchParams.get("client_id")).toBe("sigrun-client");
	expect(redirect.searchParams.get("code_challenge_method")).toBe("S256");
	expect(redirect.searchParams.get("state")).toBe("state-123");
	expect(redirect.searchParams.get("nonce")).toBe(value.data.nonce);
	expect(value.data.codeVerifier).toBeTruthy();
	// Model the browser visiting the authorization URL: begin only builds it.
	await issuer.fetch(redirectUrl);
	return value;
}

async function complete(value: LoginFlow) {
	return createOidcProvider(config(), async () => "test-client-secret", issuer.fetch).complete(value, { query: { code: "code-123", state: value.state } }, context);
}

describe("OIDC", () => {
	it("completes a valid login, maps the groups claim and email_verified", async () => {
		const result = await complete(await flow());
		expect(result).toEqual({
			subject: "subject-123",
			profile: { username: "alice", name: "Alice Example", email: "alice@example.invalid", emailVerified: true },
			groups: ["staff", "engineering"],
		});
	});

	it("rejects the wrong nonce", async () => {
		const value = await flow();
		issuer.use({ nonce: "attacker-nonce" });
		await expect(complete(value)).rejects.toThrow();
	});

	it("rejects the wrong audience", async () => {
		const value = await flow();
		issuer.use({ audience: "another-client" });
		await expect(complete(value)).rejects.toThrow();
	});

	it("rejects an expired ID token", async () => {
		const value = await flow();
		issuer.use({ expiresInSeconds: -600 });
		await expect(complete(value)).rejects.toThrow();
	});

	it("rejects an ID token not signed by the discovered JWKS", async () => {
		const value = await flow();
		issuer.use({ wrongSignature: true });
		await expect(complete(value)).rejects.toThrow();
	});
});
