/**
 * Turn the checked schema read into the runtime `ProviderConfig` list:
 * the old parser's per-kind requiredness and leniency (src/config.ts,
 * retired by the settings-rework migration) over the schema's already
 * defaulted entries. The schema replaces the parser's type checking and
 * fallback-to-default; what remains here is what JSON Schema's drawable
 * subset cannot express:
 *
 * - per-kind required fields (`issuer` for oidc; the endpoint set and
 *   `fields` for oauth2) — a missing one drops that entry with a
 *   warning, exactly as the parser did;
 * - URL validation (https, or http to a loopback host);
 * - preset expansion (github/discord endpoints, scopes, and field map,
 *   each used only where the entry does not carry its own);
 * - the issuer's trailing-slash strip;
 * - duplicate ids (the first wins, later duplicates warn and skip);
 * - the provisioning policy's grouping (`autoProvision` /
 *   `allowedGroups` / `allowedDomains` sit at the entry's top level in
 *   an old settings file; the runtime reads `policy`).
 */
import type { LoginProviderContribution } from "@sigrun/sigrun/extension";
export declare const DEFAULT_SCOPES = "openid profile email";
export declare const DEFAULT_USERNAME_CLAIM = "preferred_username";
export declare const DEFAULT_GROUPS_CLAIM = "groups";
export interface ProvisioningPolicy {
    autoProvision?: boolean;
    allowedGroups?: string[];
    allowedDomains?: string[];
}
interface Common {
    id: string;
    label: string;
    icon?: string;
    policy?: ProvisioningPolicy;
}
export interface OidcConfig extends Common {
    kind: "oidc";
    issuer: string;
    clientId: string;
    scopes: string;
    usernameClaim: string;
    groupsClaim: string;
}
export interface FieldMap {
    subject: string;
    username?: string;
    name?: string;
    email?: string;
    emailVerified?: string;
    groups?: string;
}
export interface Oauth2Config extends Common {
    kind: "oauth2";
    clientId: string;
    authorizeUrl: string;
    tokenUrl: string;
    userinfoUrl: string;
    scopes: string;
    fields: FieldMap;
    preset?: "github" | "discord";
}
export type ProviderConfig = (OidcConfig | Oauth2Config) & {
    policy?: ProvisioningPolicy;
};
export type Warning = (message: string) => void;
/** One entry to its runtime config, or undefined naming why it was skipped. */
export declare function resolveProvider(value: unknown): ProviderConfig;
/**
 * The provider list from one settings object: each entry resolved
 * independently, a malformed or duplicate entry dropped with a warning
 * (the old parser's leniency, now on top of the schema's checked read).
 */
export declare function resolveProviders(settings: Record<string, unknown>, warn?: Warning): ProviderConfig[];
export declare function contributionPolicy(config: ProviderConfig): LoginProviderContribution["policy"];
export {};
