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
export declare function parseProvider(value: unknown): ProviderConfig;
export declare function parseProviders(settings: Record<string, unknown>, warn?: Warning): ProviderConfig[];
export declare function contributionPolicy(config: ProviderConfig): LoginProviderContribution["policy"];
export {};
