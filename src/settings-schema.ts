/**
 * The oauth extension's declared settings schema (settings rework,
 * Task 10): `providers` is an entries array keyed on `id` (its
 * clientSecret is writeOnly, so the identity is required). Each entry
 * carries `kind` (`oidc` | `oauth2`; absent still means `oidc`, with the
 * schema default materializing it on read) plus the union of both
 * kinds' fields as optional properties. The drawable subset cannot
 * express per-kind requiredness, so `resolveProviders`
 * (src/providers.ts) applies the old parser's per-kind validation after
 * the checked read — exactly the "parser warned and continued" leniency
 * the schema's fallback-to-default replaces everywhere else.
 *
 * The identity property `id` lives at the ITEM level (checkSchema's
 * `x-sigrun-key` string-type check reads only item.properties); a
 * variant branch (oneOf per kind) would hide it and the declare would
 * be rejected. This is the verified resolution of the Task 5 review's
 * variant/key-shape concern.
 */

import { Type, type Static } from "typebox";

const nonEmpty = Type.String({ minLength: 1 });

const fieldMap = Type.Object(
	{
		subject: nonEmpty,
		username: Type.Optional(nonEmpty),
		name: Type.Optional(nonEmpty),
		email: Type.Optional(nonEmpty),
		emailVerified: Type.Optional(nonEmpty),
		groups: Type.Optional(nonEmpty),
	},
	{ title: "Userinfo fields" },
);

const policy = Type.Object(
	{
		autoProvision: Type.Optional(Type.Boolean()),
		allowedGroups: Type.Optional(Type.Array(nonEmpty)),
		allowedDomains: Type.Optional(Type.Array(nonEmpty)),
	},
	{ title: "Provisioning policy" },
);

const provider = Type.Object(
	{
		id: Type.String({ pattern: "^[a-z0-9][a-z0-9._-]*$" }),
		kind: Type.Union([Type.Literal("oidc"), Type.Literal("oauth2")], {
			default: "oidc",
		}),
		label: nonEmpty,
		icon: Type.Optional(nonEmpty),
		clientId: nonEmpty,
		clientSecret: Type.Optional(
			Type.String({
				writeOnly: true,
				title: "Client secret",
				description: "Stored in the extension secrets store, never in the settings file.",
			}),
		),
		// OIDC.
		issuer: Type.Optional(nonEmpty),
		scopes: Type.Optional(Type.String({ default: "openid profile email" })),
		usernameClaim: Type.Optional(Type.String({ default: "preferred_username" })),
		groupsClaim: Type.Optional(Type.String({ default: "groups" })),
		// OAuth 2 (preset or explicit endpoints).
		preset: Type.Optional(Type.Union([Type.Literal("github"), Type.Literal("discord")])),
		authorizeUrl: Type.Optional(nonEmpty),
		tokenUrl: Type.Optional(nonEmpty),
		userinfoUrl: Type.Optional(nonEmpty),
		fields: Type.Optional(fieldMap),
		policy: Type.Optional(policy),
	},
	{
		"x-sigrun-key": "id",
		"x-sigrun-summary": ["label", "kind"],
	},
);

/**
 * Widen a TypeBox schema to the host's structural JSON-Schema contract
 * (`SettingsJsonSchema = Readonly<Record<string, unknown>>`): TypeBox's
 * TObject carries no string index signature, but every schema it builds
 * IS a plain JSON object. The `Static` types stay on the original.
 */
function asJsonSchema<T>(schema: T): T & Readonly<Record<string, unknown>> {
	return schema as T & Readonly<Record<string, unknown>>;
}

export const OAUTH_SETTINGS_SCHEMA = asJsonSchema(Type.Object({
	providers: Type.Array(provider, {
		description: "Login providers (OIDC or OAuth 2), keyed by id.",
	}),
}));

export type OauthSettingsFile = Static<typeof OAUTH_SETTINGS_SCHEMA>;
export type ProviderEntry = Static<typeof provider>;
