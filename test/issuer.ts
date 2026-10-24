import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from "jose";

export interface IssuerOverrides {
	issuer?: string;
	audience?: string;
	nonce?: string;
	expiresInSeconds?: number;
	groups?: unknown;
	emailVerified?: unknown;
	omitEmailVerified?: boolean;
	wrongSignature?: boolean;
}

export class TestIssuer {
	issuer = "https://issuer.example.invalid";
	readonly fetch: typeof fetch = async (input, init) => {
		const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
		if (url.origin !== this.issuer) throw new Error("unexpected test issuer origin");
		return fetch(`http://127.0.0.1:${this.port}${url.pathname}${url.search}`, init);
	};
	private port = 0;
	lastTokenRequest = "";
	private nonce = "";
	private server: Server | undefined;
	private signingKey: CryptoKey | undefined;
	private wrongSigningKey: CryptoKey | undefined;
	private publicJwk: Record<string, unknown> = {};
	private overrides: IssuerOverrides = {};

	async start(): Promise<void> {
		const { publicKey, privateKey } = await generateKeyPair("ES256");
		this.signingKey = privateKey;
		this.wrongSigningKey = (await generateKeyPair("ES256")).privateKey;
		this.publicJwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "ES256", use: "sig" };
		this.server = createServer((request, response) => {
			void this.handle(request.url ?? "/", request, response);
		});
		this.server.listen(0, "127.0.0.1");
		await once(this.server, "listening");
		const address = this.server.address();
		if (typeof address !== "object" || address === null) throw new Error("test issuer has no port");
		this.port = address.port;
	}

	async stop(): Promise<void> {
		if (this.server !== undefined) {
			this.server.close();
			await once(this.server, "close");
		}
	}

	use(overrides: IssuerOverrides): void {
		this.overrides = overrides;
	}

	private async handle(url: string, request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse): Promise<void> {
		if (url === "/.well-known/openid-configuration") {
			this.json(response, {
				issuer: this.issuer,
				authorization_endpoint: `${this.issuer}/authorize`,
				token_endpoint: `${this.issuer}/token`,
				jwks_uri: `${this.issuer}/jwks`,
				response_types_supported: ["code"],
				id_token_signing_alg_values_supported: ["ES256"],
			});
			return;
		}
		if (url === "/jwks") {
			this.json(response, { keys: [this.publicJwk] });
			return;
		}
		if (url.startsWith("/authorize")) {
			this.nonce = new URL(url, this.issuer).searchParams.get("nonce") ?? "";
			this.json(response, { ok: true });
			return;
		}
		if (url === "/token" && request.method === "POST") {
			let body = "";
			for await (const chunk of request) body += chunk;
			this.lastTokenRequest = body;
			const now = Math.floor(Date.now() / 1000);
			const token = await new SignJWT({
				nonce: this.overrides.nonce ?? this.nonce,
				preferred_username: "alice",
				name: "Alice Example",
				email: "alice@example.invalid",
				...(this.overrides.omitEmailVerified === true
					? {}
					: { email_verified: this.overrides.emailVerified ?? true }),
				groups: this.overrides.groups ?? ["staff", "engineering"],
			})
				.setProtectedHeader({ alg: "ES256", kid: "test-key", typ: "JWT" })
				.setIssuer(this.overrides.issuer ?? this.issuer)
				.setSubject("subject-123")
				.setAudience(this.overrides.audience ?? "sigrun-client")
				.setIssuedAt(now)
				.setExpirationTime(now + (this.overrides.expiresInSeconds ?? 300))
				.sign(this.overrides.wrongSignature === true ? this.wrongSigningKey! : this.signingKey!);
			this.json(response, { access_token: "issuer-access-token", token_type: "Bearer", id_token: token });
			return;
		}
		response.writeHead(404).end();
	}

	private json(response: import("node:http").ServerResponse, body: unknown): void {
		response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
	}
}
