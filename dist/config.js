import { githubPreset, discordPreset } from "./presets.js";
export const DEFAULT_SCOPES = "openid profile email";
export const DEFAULT_USERNAME_CLAIM = "preferred_username";
export const DEFAULT_GROUPS_CLAIM = "groups";
function object(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function string(entry, key, required = true) {
    const value = entry[key];
    if (value === undefined && !required)
        return undefined;
    if (typeof value !== "string" || value.length === 0)
        throw new Error(`${key} must be a non-empty string`);
    return value;
}
function url(entry, key) {
    const value = string(entry, key);
    try {
        const parsed = new URL(value);
        const loopback = ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
        if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback))
            throw new Error();
        return value;
    }
    catch {
        throw new Error(`${key} must be an HTTP(S) URL`);
    }
}
function strings(value, key) {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0))
        throw new Error(`${key} must be an array of non-empty strings`);
    return value;
}
function policy(entry) {
    const result = {};
    if (entry.autoProvision !== undefined) {
        if (typeof entry.autoProvision !== "boolean")
            throw new Error("autoProvision must be boolean");
        result.autoProvision = entry.autoProvision;
    }
    result.allowedGroups = strings(entry.allowedGroups, "allowedGroups");
    result.allowedDomains = strings(entry.allowedDomains, "allowedDomains");
    return Object.keys(result).length === 0 ? undefined : result;
}
function common(entry) {
    const id = string(entry, "id");
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(id))
        throw new Error("id is invalid");
    return {
        id,
        label: string(entry, "label"),
        ...(entry.icon === undefined ? {} : { icon: string(entry, "icon") }),
        ...(policy(entry) === undefined ? {} : { policy: policy(entry) }),
    };
}
function scopes(entry) {
    return string(entry, "scopes", false) ?? DEFAULT_SCOPES;
}
function fields(value) {
    if (!object(value))
        throw new Error("fields must be an object");
    const result = { subject: string(value, "subject") };
    for (const key of ["username", "name", "email", "emailVerified", "groups"]) {
        const field = string(value, key, false);
        if (field !== undefined)
            result[key] = field;
    }
    return result;
}
export function parseProvider(value) {
    if (!object(value))
        throw new Error("provider must be an object");
    const base = common(value);
    const clientId = string(value, "clientId");
    if (value.kind === "oidc") {
        return {
            ...base,
            kind: "oidc",
            clientId,
            issuer: url(value, "issuer").replace(/\/$/, ""),
            scopes: scopes(value),
            usernameClaim: string(value, "usernameClaim", false) ?? DEFAULT_USERNAME_CLAIM,
            groupsClaim: string(value, "groupsClaim", false) ?? DEFAULT_GROUPS_CLAIM,
        };
    }
    if (value.kind !== "oauth2")
        throw new Error("kind must be oidc or oauth2");
    let endpoints;
    let preset;
    if (value.preset !== undefined) {
        if (value.preset !== "github" && value.preset !== "discord")
            throw new Error("unknown oauth2 preset");
        preset = value.preset;
        endpoints = { ...(preset === "github" ? githubPreset() : discordPreset()) };
    }
    else {
        endpoints = value;
    }
    return {
        ...base,
        kind: "oauth2",
        clientId,
        authorizeUrl: url(endpoints, "authorizeUrl"),
        tokenUrl: url(endpoints, "tokenUrl"),
        userinfoUrl: url(endpoints, "userinfoUrl"),
        scopes: scopes({ scopes: value.scopes ?? endpoints.scopes }),
        fields: fields(value.fields ?? endpoints.fields),
        ...(preset === undefined ? {} : { preset }),
    };
}
export function parseProviders(settings, warn = console.warn) {
    if (settings.providers === undefined)
        return [];
    if (!Array.isArray(settings.providers)) {
        warn("oauth: settings providers is not an array; no login providers loaded");
        return [];
    }
    const providers = [];
    const ids = new Set();
    for (const value of settings.providers) {
        const name = object(value) && typeof value.id === "string" ? value.id : "unnamed";
        try {
            const provider = parseProvider(value);
            if (ids.has(provider.id)) {
                warn(`oauth: skipping duplicate provider "${provider.id}"`);
                continue;
            }
            ids.add(provider.id);
            providers.push(provider);
        }
        catch (error) {
            warn(`oauth: skipping malformed provider "${name}": ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return providers;
}
export function contributionPolicy(config) {
    return config.policy;
}
