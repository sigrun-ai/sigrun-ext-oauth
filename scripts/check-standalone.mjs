#!/usr/bin/env node
/**
 * Standalone-install check (release Task 1.1): this package must install
 * standalone with ONLY its runtime dependency (oauth4webapi). The sigrun
 * host contract is type-only — `import type { ... } from
 * "@sigrun/sigrun/extension"` — so the published tarball must not drag
 * the host package into a consumer's node_modules.
 *
 * Method: `npm pack` the package, install the tarball into a temp dir
 * with --ignore-scripts, and fail if node_modules/@sigrun/sigrun exists
 * after the install.
 *
 * Invoked from `npm test` after check-manifest.mjs. Exits nonzero naming
 * the violation.
 */

import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoDir = dirname(dirname(fileURLToPath(import.meta.url)));
const tempDir = mkdtempSync(join(tmpdir(), "sigrun-oauth-standalone-"));

function run(command, args, options) {
	return execFileSync(command, args, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		...options,
	});
}

try {
	/** Build the published tarball in the temp dir (keeps the repo clean). */
	mkdirSync(join(tempDir, "pack"));
	const packOut = run("npm", ["pack", "--pack-destination", join(tempDir, "pack")], {
		cwd: repoDir,
	});
	const tarballName = packOut
		.trim()
		.split("\n")
		.at(-1)
		.trim();
	const tarball = join(tempDir, "pack", tarballName);
	if (!existsSync(tarball)) {
		console.error(`check-standalone: npm pack did not produce ${tarball}`);
		process.exit(1);
	}

	/** Install the tarball standalone. */
	const installDir = join(tempDir, "install");
	mkdirSync(installDir);
	writeFileSync(
		join(installDir, "package.json"),
		JSON.stringify({ name: "standalone-check", private: true }, null, "\t") + "\n",
	);
	run(
		"npm",
		["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
		{ cwd: installDir },
	);

	const hostPath = join(installDir, "node_modules", "@sigrun", "sigrun");
	if (existsSync(hostPath)) {
		console.error(
			`check-standalone: FAIL — @sigrun/sigrun installed into a standalone consumer (${hostPath}). ` +
				`The host contract is type-only; it must be a devDependency, not a peer/dependency.`,
		);
		process.exit(1);
	}
	const lockName = JSON.parse(readFileSync(join(repoDir, "package.json"), "utf8")).name;
	console.log(`check-standalone: ok (${lockName} installs standalone, no @sigrun/sigrun)`);
} finally {
	rmSync(tempDir, { recursive: true, force: true });
}
