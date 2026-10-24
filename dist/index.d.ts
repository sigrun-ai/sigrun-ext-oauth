import type { SigrunExtensionResult, SigrunHost } from "@sigrun/sigrun/extension";
export declare const EXTENSION_NAME = "oauth";
/** Build login providers from this extension's scoped settings and secrets. */
export declare function createOAuth(host: SigrunHost): Promise<SigrunExtensionResult>;
export default createOAuth;
export { parseProviders, parseProvider } from "./config.js";
export type { ProviderConfig, OidcConfig, Oauth2Config, FieldMap } from "./config.js";
export { createOidcProvider } from "./oidc.js";
export { createOauth2Provider } from "./oauth2.js";
export { githubPreset, discordPreset } from "./presets.js";
