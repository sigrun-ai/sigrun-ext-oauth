import { parseProviders } from "./config.js";
import { createOidcProvider } from "./oidc.js";
import { createOauth2Provider } from "./oauth2.js";
export const EXTENSION_NAME = "oauth";
/** Build login providers from this extension's scoped settings and secrets. */
export async function createOAuth(host) {
    const settings = await host.stores.settings.get();
    const loginProviders = parseProviders(settings).map((config) => {
        const readSecret = () => host.stores.secrets.get(`${config.id}.clientSecret`);
        return config.kind === "oidc"
            ? createOidcProvider(config, readSecret)
            : createOauth2Provider(config, readSecret);
    });
    return { name: EXTENSION_NAME, loginProviders };
}
export default createOAuth;
export { parseProviders, parseProvider } from "./config.js";
export { createOidcProvider } from "./oidc.js";
export { createOauth2Provider } from "./oauth2.js";
export { githubPreset, discordPreset } from "./presets.js";
