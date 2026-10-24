import type { HandlerContext, LoginFlow, LoginProviderContribution, LoginResult } from "@sigrun/sigrun/extension";
import type { Oauth2Config } from "./config.js";
import type { Fetch, SecretReader } from "./oidc.js";
export declare function mapUserinfo(config: Oauth2Config, userinfo: unknown): LoginResult;
export declare function beginOauth2(config: Oauth2Config, flow: LoginFlow): Promise<{
    redirectUrl: string;
}>;
export declare function completeOauth2(config: Oauth2Config, flow: LoginFlow, callback: {
    query: Record<string, string>;
}, ctx: HandlerContext, secret: string | undefined, fetchImpl: Fetch): Promise<LoginResult>;
export declare function createOauth2Provider(config: Oauth2Config, readSecret: SecretReader, fetchImpl?: Fetch): LoginProviderContribution;
