import * as oauth from "oauth4webapi";
import type { HandlerContext, LoginFlow, LoginProviderContribution, LoginResult } from "@sigrun/sigrun/extension";
import type { OidcConfig } from "./config.js";
export type Fetch = typeof fetch;
export type SecretReader = () => Promise<string | undefined>;
export declare function discover(issuer: string, fetchImpl: Fetch, ctx: HandlerContext): Promise<oauth.AuthorizationServer>;
export declare function beginOidc(config: OidcConfig, flow: LoginFlow, ctx: HandlerContext, fetchImpl: Fetch): Promise<{
    redirectUrl: string;
}>;
export declare function oidcResult(config: OidcConfig, claims: oauth.IDToken): LoginResult;
export declare function completeOidc(config: OidcConfig, flow: LoginFlow, callback: {
    query: Record<string, string>;
    body?: unknown;
}, ctx: HandlerContext, secret: string | undefined, fetchImpl: Fetch): Promise<LoginResult>;
export declare function createOidcProvider(config: OidcConfig, readSecret: SecretReader, fetchImpl?: Fetch): LoginProviderContribution;
