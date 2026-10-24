#!/usr/bin/env node
/**
 * Release-manifest hygiene check (release-0.1 Task 3): asserts this
 * package's npm-facing shape — the published name, the peer/dev split
 * for host modules, publish metadata, and the tarball files whitelist.
 *
 * Invoked as `node scripts/check-manifest.mjs` from `npm test` (this
 * repo's manifest contract is part of the gate). Exits nonzero naming
 * every violation.
 *
 * Usage: node scripts/check-manifest.mjs [--expect-name @scope/name]
 * (defaults to this repo's manifest name when --expect-name is absent).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoDir = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(
	readFileSync(join(repoDir, "package.json"), "utf8"),
);

const args = process.argv.slice(2);
function argValue(flag) {
	const index = args.indexOf(flag);
	return index === -1 ? undefined : args[index + 1];
}

const failures = [];
function check(condition, message) {
	if (!condition) failures.push(message);
}

const expectedName = argValue("--expect-name");
const name = expectedName ?? manifest.name;

check(name !== undefined, "package.json: name is absent");
if (expectedName !== undefined) {
	check(
		manifest.name === expectedName,
		`package.json: name is "${manifest.name}", expected "${expectedName}"`,
	);
}

check(manifest.private !== true, "package.json: private:true — this package is published");
check(manifest.license === "MIT", `package.json: license must be "MIT" (got ${JSON.stringify(manifest.license)})`);
check(
	manifest.engines?.node === ">=22.19.0",
	`package.json: engines.node must be ">=22.19.0" (got ${JSON.stringify(manifest.engines?.node)})`,
);
check(
	manifest.publishConfig?.access === "public" && manifest.publishConfig?.provenance === true,
	`package.json: publishConfig must be {"access":"public","provenance":true} (got ${JSON.stringify(manifest.publishConfig)})`,
);
check(Array.isArray(manifest.files) && manifest.files.length > 0, "package.json: files whitelist is absent/empty");
check(
	typeof manifest.repository?.url === "string" && manifest.repository.url.startsWith("git+https://github.com/sigrun-ai/"),
	`package.json: repository.url must point at github.com/sigrun-ai/<repo> (got ${JSON.stringify(manifest.repository?.url)})`,
);
check(typeof manifest.bugs?.url === "string", "package.json: bugs.url absent");
check(typeof manifest.homepage === "string", "package.json: homepage absent");

/** This extension imports core's TYPES-ONLY extension contract. Unlike
 * codemode's local exact-pin gate, host modules here MUST use "*": the
 * sigrun host supplies them and a published extension cannot pin its host.
 * Core's types-only contract is resolved through tsconfig paths during
 * development, so it needs no devDependency or node_modules entry. */
const HOST_MODULES = new Set(["@sigrun/sigrun"]);
const peers = manifest.peerDependencies ?? {};
for (const [module, spec] of Object.entries(peers)) {
	check(
		HOST_MODULES.has(module),
		`package.json: peerDependencies carries non-host module "${module}"`,
	);
	check(spec === "*", `package.json: peerDependencies["${module}"] must be "*" (got ${JSON.stringify(spec)})`);
}

/** No stray file: specifiers in a published dependencies field. */
for (const field of ["dependencies", "peerDependencies"]) {
	for (const [module, spec] of Object.entries(manifest[field] ?? {})) {
		check(
			!String(spec).startsWith("file:"),
			`package.json: ${field}["${module}"] carries a file: specifier ("${spec}") — published deps must be registry specs`,
		);
	}
}

if (failures.length > 0) {
	console.error(`check-manifest: ${failures.length} violation(s) in ${repoDir}:`);
	for (const failure of failures) {
		console.error(`  - ${failure}`);
	}
	process.exit(1);
}
console.log(`check-manifest: ok (${name})`);