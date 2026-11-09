import type {
	LoginProviderContribution,
	SigrunExtensionResult,
	SigrunHost,
} from "@sigrun/sigrun/extension";
import { OAUTH_SETTINGS_SCHEMA } from "./settings-schema.js";
import { resolveProviders } from "./providers.js";
import { createOidcProvider } from "./oidc.js";
import { createOauth2Provider } from "./oauth2.js";

export const EXTENSION_NAME = "oauth";

/** The pre-schema flat secret key for one provider's client secret. */
export function legacySecretKey(id: string): string {
	return `${id}.clientSecret`;
}

/** The schema-declared nested secret key (settings rework §secrets). */
export function providerSecretKey(id: string): string {
	return `providers/${id}/clientSecret`;
}

/**
 * One-time secret migration (settings rework Task 10): a client secret
 * stored under the old flat `<id>.clientSecret` key moves to the
 * schema-declared `providers/<id>/clientSecret` key — copied, then the
 * old key deleted. An entry whose new key already holds a value is left
 * alone (the new spelling wins).
 */
async function migrateClientSecrets(
	host: SigrunHost,
	ids: readonly string[],
): Promise<void> {
	for (const id of ids) {
		const current = await host.stores.secrets.get(providerSecretKey(id));
		// Absent/empty means migrate. A present new key wins, but the stale
		// legacy key still gets removed so secrets.json does not keep it.
		if (current !== undefined && current !== "") {
			await host.stores.secrets.delete(legacySecretKey(id));
			continue;
		}
		const legacy = await host.stores.secrets.get(legacySecretKey(id));
		if (legacy === undefined || legacy === "") continue;
		await host.stores.secrets.set(providerSecretKey(id), legacy);
		await host.stores.secrets.delete(legacySecretKey(id));
	}
}

/** Build login providers from this extension's declared settings and secrets. */
export async function createOAuth(host: SigrunHost): Promise<SigrunExtensionResult> {
	const declared = host.settings.declare<Record<string, unknown>, unknown>({
		schema: OAUTH_SETTINGS_SCHEMA,
	});
	const settings = await declared.get();
	const configs = resolveProviders(settings);
	// Migration is deliberately driven by the resolved providers: a dropped
	// malformed/duplicate entry no longer has a live secret path to move.
	await migrateClientSecrets(host, configs.map((config) => config.id));
	const loginProviders: LoginProviderContribution[] = configs.map((config) => {
		const readSecret = () => host.stores.secrets.get(providerSecretKey(config.id));
		return config.kind === "oidc"
			? createOidcProvider(config, readSecret)
			: createOauth2Provider(config, readSecret);
	});
	return { name: EXTENSION_NAME, loginProviders };
}

export default createOAuth;
export { resolveProviders, resolveProvider } from "./providers.js";
export type { ProviderConfig, OidcConfig, Oauth2Config, FieldMap } from "./providers.js";
export { OAUTH_SETTINGS_SCHEMA } from "./settings-schema.js";
export type { OauthSettingsFile, ProviderEntry } from "./settings-schema.js";
export { createOidcProvider } from "./oidc.js";
export { createOauth2Provider } from "./oauth2.js";
export { githubPreset, discordPreset } from "./presets.js";
