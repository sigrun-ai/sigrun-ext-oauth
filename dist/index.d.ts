import type { SigrunExtensionResult, SigrunHost } from "@sigrun/sigrun/extension";
export declare const EXTENSION_NAME = "oauth";
/** The pre-schema flat secret key for one provider's client secret. */
export declare function legacySecretKey(id: string): string;
/** The schema-declared nested secret key (settings rework §secrets). */
export declare function providerSecretKey(id: string): string;
/** Build login providers from this extension's declared settings and secrets. */
export declare function createOAuth(host: SigrunHost): Promise<SigrunExtensionResult>;
export default createOAuth;
export { resolveProviders, resolveProvider } from "./providers.js";
export type { ProviderConfig, OidcConfig, Oauth2Config, FieldMap } from "./providers.js";
export { OAUTH_SETTINGS_SCHEMA } from "./settings-schema.js";
export type { OauthSettingsFile, ProviderEntry } from "./settings-schema.js";
export { createOidcProvider } from "./oidc.js";
export { createOauth2Provider } from "./oauth2.js";
export { githubPreset, discordPreset } from "./presets.js";
