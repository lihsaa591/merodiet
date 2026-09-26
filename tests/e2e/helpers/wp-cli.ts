import { execSync } from 'node:child_process';

/**
 * Runs a WP-CLI command inside the project's wp-env container and
 * returns its trimmed stdout. Throws (with wp-env's own error output)
 * if the command fails — callers should let that propagate rather
 * than swallow it, since a failed seed step must not silently
 * continue into a suite that then fails confusingly at the assertion
 * layer instead.
 */
export function runWpCli( command: string ): string {
	return execSync( `npx wp-env run cli -- wp ${ command }`, {
		encoding: 'utf8',
	} ).trim();
}
