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
declare const provider: Type.TObject<{
    id: Type.TString;
    kind: Type.TUnion<[Type.TLiteral<"oidc">, Type.TLiteral<"oauth2">]>;
    label: Type.TString;
    icon: Type.TOptional<Type.TString>;
    clientId: Type.TString;
    clientSecret: Type.TOptional<Type.TString>;
    issuer: Type.TOptional<Type.TString>;
    scopes: Type.TOptional<Type.TString>;
    usernameClaim: Type.TOptional<Type.TString>;
    groupsClaim: Type.TOptional<Type.TString>;
    preset: Type.TOptional<Type.TUnion<[Type.TLiteral<"github">, Type.TLiteral<"discord">]>>;
    authorizeUrl: Type.TOptional<Type.TString>;
    tokenUrl: Type.TOptional<Type.TString>;
    userinfoUrl: Type.TOptional<Type.TString>;
    fields: Type.TOptional<Type.TObject<{
        subject: Type.TString;
        username: Type.TOptional<Type.TString>;
        name: Type.TOptional<Type.TString>;
        email: Type.TOptional<Type.TString>;
        emailVerified: Type.TOptional<Type.TString>;
        groups: Type.TOptional<Type.TString>;
    }>>;
    policy: Type.TOptional<Type.TObject<{
        autoProvision: Type.TOptional<Type.TBoolean>;
        allowedGroups: Type.TOptional<Type.TArray<Type.TString>>;
        allowedDomains: Type.TOptional<Type.TArray<Type.TString>>;
    }>>;
}>;
export declare const OAUTH_SETTINGS_SCHEMA: Type.TObject<{
    providers: Type.TArray<Type.TObject<{
        id: Type.TString;
        kind: Type.TUnion<[Type.TLiteral<"oidc">, Type.TLiteral<"oauth2">]>;
        label: Type.TString;
        icon: Type.TOptional<Type.TString>;
        clientId: Type.TString;
        clientSecret: Type.TOptional<Type.TString>;
        issuer: Type.TOptional<Type.TString>;
        scopes: Type.TOptional<Type.TString>;
        usernameClaim: Type.TOptional<Type.TString>;
        groupsClaim: Type.TOptional<Type.TString>;
        preset: Type.TOptional<Type.TUnion<[Type.TLiteral<"github">, Type.TLiteral<"discord">]>>;
        authorizeUrl: Type.TOptional<Type.TString>;
        tokenUrl: Type.TOptional<Type.TString>;
        userinfoUrl: Type.TOptional<Type.TString>;
        fields: Type.TOptional<Type.TObject<{
            subject: Type.TString;
            username: Type.TOptional<Type.TString>;
            name: Type.TOptional<Type.TString>;
            email: Type.TOptional<Type.TString>;
            emailVerified: Type.TOptional<Type.TString>;
            groups: Type.TOptional<Type.TString>;
        }>>;
        policy: Type.TOptional<Type.TObject<{
            autoProvision: Type.TOptional<Type.TBoolean>;
            allowedGroups: Type.TOptional<Type.TArray<Type.TString>>;
            allowedDomains: Type.TOptional<Type.TArray<Type.TString>>;
        }>>;
    }>>;
}> & Readonly<Record<string, unknown>>;
export type OauthSettingsFile = Static<typeof OAUTH_SETTINGS_SCHEMA>;
export type ProviderEntry = Static<typeof provider>;
export {};
