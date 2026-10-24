import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createOauth2Provider } from "../src/oauth2.js";
import { githubPreset, discordPreset } from "../src/presets.js";
import type { LoginFlow } from "@sigrun/sigrun/extension";

let server: Server;
let base: string;
let port: number;
const testFetch: typeof fetch = async (input, init) => {
	const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
	if (url.origin !== "https://oauth.example.invalid") throw new Error("unexpected test OAuth origin");
	return fetch(`http://127.0.0.1:${port}${url.pathname}${url.search}`, init);
};
const context = { abortSignal: undefined };

beforeAll(async () => {
	server = createServer(async (request, response) => {
		if (request.url === "/me") {
			response.writeHead(200, { "content-type": "application/json" });
			response.end(JSON.stringify({ account: { identifier: "user-42", handle: "alice", display: "Alice", contact: { address: "alice@example.invalid", confirmed: true }, roles: ["staff"] } }));
			return;
		}
		if (request.url === "/token" && request.method === "POST") {
			response.writeHead(200, { "content-type": "application/json" });
			response.end(JSON.stringify({ access_token: "access-token", token_type: "Bearer" }));
			return;
		}
		response.writeHead(404).end();
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (typeof address !== "object" || address === null) throw new Error("no port");
	port = address.port;
	base = "https://oauth.example.invalid";
});
afterAll(async () => { server.close(); await once(server, "close"); });

function flow(): LoginFlow {
	return { state: "state", callbackUrl: "https://sigrun.example.invalid/callback", data: {} };
}

describe("explicit OAuth 2 endpoints", () => {
	it("uses field paths for subject, profile, email verification, and groups", async () => {
		const provider = createOauth2Provider({
			id: "custom", label: "Custom", kind: "oauth2", clientId: "client",
			authorizeUrl: `${base}/authorize`, tokenUrl: `${base}/token`, userinfoUrl: `${base}/me`,
			scopes: "identity email",
			fields: { subject: "account.identifier", username: "account.handle", name: "account.display", email: "account.contact.address", emailVerified: "account.contact.confirmed", groups: "account.roles" },
		}, async () => "secret", testFetch);
		const login = flow();
		await provider.begin(login, context);
		expect(await provider.complete(login, { query: { code: "code", state: "state" } }, context)).toEqual({
			subject: "user-42",
			profile: { username: "alice", name: "Alice", email: "alice@example.invalid", emailVerified: true },
			groups: ["staff"],
		});
	});
});

describe("presets", () => {
	it("pins GitHub URLs and sends an authenticated PKCE token request", async () => {
		const fetchMock = vi.fn<typeof fetch>();
		const provider = createOauth2Provider({ ...githubPreset(), id: "gh", label: "GitHub", kind: "oauth2", clientId: "gh-client" }, async () => "gh-secret", fetchMock);
		const login = flow();
		const { redirectUrl } = await provider.begin(login, context);
		const url = new URL(redirectUrl);
		expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
		expect(fetchMock).not.toHaveBeenCalled();
		await expect(provider.complete(login, { query: { code: "code", state: "state" } }, context)).rejects.toThrow();
		const [requestUrl, init] = fetchMock.mock.calls[0];
		expect(String(requestUrl)).toBe("https://github.com/login/oauth/access_token");
		const body = new URLSearchParams(init?.body as string);
		expect(body.get("client_id")).toBe("gh-client");
		expect(body.get("client_secret")).toBe("gh-secret");
		expect(body.get("code_verifier")).toBe(login.data.codeVerifier);
	});

	it("pins Discord URLs", () => {
		expect(discordPreset()).toMatchObject({
			authorizeUrl: "https://discord.com/oauth2/authorize",
			tokenUrl: "https://discord.com/api/oauth2/token",
			userinfoUrl: "https://discord.com/api/users/@me",
		});
	});
});
