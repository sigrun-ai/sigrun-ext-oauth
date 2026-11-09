import type { FieldMap } from "./providers.js";
export interface Preset {
    authorizeUrl: string;
    tokenUrl: string;
    userinfoUrl: string;
    scopes: string;
    fields: FieldMap;
}
export declare function githubPreset(): Preset;
export declare function discordPreset(): Preset;
