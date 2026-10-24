import type { FieldMap } from "./config.js";

export interface Preset {
	authorizeUrl: string;
	tokenUrl: string;
	userinfoUrl: string;
	scopes: string;
	fields: FieldMap;
}

export function githubPreset(): Preset {
	return {
		authorizeUrl: "https://github.com/login/oauth/authorize",
		tokenUrl: "https://github.com/login/oauth/access_token",
		userinfoUrl: "https://api.github.com/user",
		scopes: "read:user user:email",
		fields: { subject: "id", username: "login", name: "name" },
	};
}

export function discordPreset(): Preset {
	return {
		authorizeUrl: "https://discord.com/oauth2/authorize",
		tokenUrl: "https://discord.com/api/oauth2/token",
		userinfoUrl: "https://discord.com/api/users/@me",
		scopes: "identify email",
		fields: { subject: "id", username: "username", email: "email", emailVerified: "verified" },
	};
}
