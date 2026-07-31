/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as semver from 'semver'
import * as vscode from 'vscode'
import fs from '../../../shared/fs/fs'
import { getLogger } from '../../../shared/logger/logger'
import { ChildProcess } from '../../../shared/utilities/processUtils'
import { getResolvedShellEnv, mergeResolvedShellPath } from '../../../shared/env/resolveEnv'

const logger = getLogger('cdkLsp')

/**
 * First GA `aws-cdk` release that ships the `cdk lsp` command (integrated via
 * aws/aws-cdk-cli#1681, tagged aws-cdk@v2.1132.0). Older CLIs have no `lsp`
 * subcommand, so we refuse to wire the client and prompt for an upgrade.
 */
export const minimumCdkLspVersion = '2.1132.0'

/** Where in the discovery ladder a `cdk` binary was found. */
export type CdkCliSource = 'setting' | 'nodeModules' | 'path'

export interface ResolvedCdkCli {
    /** Absolute path to the `cdk` executable, or the bare name to resolve via PATH. */
    readonly command: string
    readonly source: CdkCliSource
    /** Parsed CLI version once probed. */
    readonly version?: string
}

/**
 * Build the environment the spawned `cdk lsp` (and its synth subprocess) needs.
 *
 * `cdk lsp` synthesizes the user's app as a child process (npx/ts-node, python,
 * mvn), so it must inherit a login-shell PATH even when VS Code was launched
 * from the Dock. We reuse the toolkit's shell resolver:
 *  - `mergeResolvedShellPath` folds the login-shell PATH into process.env.PATH.
 *  - JAVA_HOME is NOT carried by that merge, so we pull it from the full
 *    resolved env for Java synth. Both calls hit the same 5-min cache, so only
 *    one shell spawn happens.
 *
 * We do NOT inject AWS credentials: synth does not need them (only context
 * lookups do), and triggering an auth prompt on editor open is unacceptable.
 */
export async function buildCdkSpawnEnv(): Promise<NodeJS.ProcessEnv> {
    const merged = await mergeResolvedShellPath(process.env)
    const env: NodeJS.ProcessEnv = { ...merged }

    const resolved = await getResolvedShellEnv(process.env)
    if (resolved?.JAVA_HOME && !env.JAVA_HOME) {
        env.JAVA_HOME = resolved.JAVA_HOME
    }
    return env
}

/**
 * Resolve the `cdk` CLI for a given CDK app directory using the full ladder:
 *   1. explicit `aws.cdk.cliPath` setting (escape hatch),
 *   2. workspace-local install (node_modules/.bin/cdk, walking up from appDir),
 *   3. `cdk` on the resolved shell PATH.
 * Returns undefined when no candidate exists on disk.
 */
export async function resolveCdkCli(appDir: string, env: NodeJS.ProcessEnv): Promise<ResolvedCdkCli | undefined> {
    // 1. Setting override.
    const configured = vscode.workspace.getConfiguration('aws.cdk').get<string>('cliPath')?.trim()
    if (configured) {
        if (await fs.existsFile(configured)) {
            return { command: configured, source: 'setting' }
        }
        logger.warn(`aws.cdk.cliPath is set to a missing path: ${configured}`)
    }

    // 2. Workspace-local node_modules/.bin/cdk, walking up from the app dir.
    const local = await findInNodeModules(appDir)
    if (local) {
        return { command: local, source: 'nodeModules' }
    }

    // 3. PATH (using the shell-resolved PATH).
    const onPath = await findOnPath('cdk', env)
    if (onPath) {
        return { command: onPath, source: 'path' }
    }

    return undefined
}

/** Walk up from appDir looking for node_modules/.bin/cdk. */
async function findInNodeModules(appDir: string): Promise<string | undefined> {
    const binName = process.platform === 'win32' ? 'cdk.cmd' : 'cdk'
    let dir = appDir
    // Walk up to the filesystem root.
    for (;;) {
        const candidate = path.join(dir, 'node_modules', '.bin', binName)
        if (await fs.existsFile(candidate)) {
            return candidate
        }
        const parent = path.dirname(dir)
        if (parent === dir) {
            return undefined
        }
        dir = parent
    }
}

/** `which`-style scan of env.PATH for an executable. */
async function findOnPath(name: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
    const rawPath = env.PATH ?? process.env.PATH ?? ''
    const exts = process.platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : ['']
    for (const dir of rawPath.split(path.delimiter)) {
        if (!dir) {
            continue
        }
        for (const ext of exts) {
            const candidate = path.join(dir, name + ext)
            if (await fs.existsFile(candidate)) {
                return candidate
            }
        }
    }
    return undefined
}

/**
 * Run `<cdk> --version` and return the parsed semver, or undefined if the
 * command fails or its output is unrecognizable.
 */
export async function probeCdkVersion(command: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
    try {
        const proc = new ChildProcess(command, ['--version'], { spawnOptions: { env }, collect: true })
        const result = await proc.run()
        if (result.exitCode !== 0) {
            logger.warn(`\`${command} --version\` exited ${result.exitCode}`)
            return undefined
        }
        return parseCliVersion(result.stdout)
    } catch (err) {
        logger.warn(`Failed to probe cdk version: %O`, err)
        return undefined
    }
}

/** Extract the leading `X.Y.Z` from `cdk --version` output (e.g. "2.1132.0 (build abc)"). */
export function parseCliVersion(out: string): string | undefined {
    return out.match(/(\d+\.\d+\.\d+)/)?.[1]
}

/** True when `version` >= minimumCdkLspVersion. */
export function meetsMinimum(version: string): boolean {
    return semver.valid(version) !== null && semver.gte(version, minimumCdkLspVersion)
}
