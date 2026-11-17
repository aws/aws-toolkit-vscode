/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import { createRequire } from 'module'
import * as semver from 'semver'
import fs from '../../../shared/fs/fs'
import { getLogger } from '../../../shared/logger/logger'

const logger = getLogger('cdkLsp')

/**
 * First GA `aws-cdk` release that ships the `cdk lsp` command (integrated via
 * aws/aws-cdk-cli#1681, tagged aws-cdk@v2.1132.0).
 */
export const minimumCdkLspVersion = '2.1132.0'

/** Where in the discovery ladder a `cdk` CLI was found. */
export type CdkCliSource = 'setting' | 'nodeModules' | 'path'

export interface ResolvedCdkCli {
    /** Absolute path of the program to spawn. */
    readonly command: string
    /** Arguments up to and including `lsp`. */
    readonly args: string[]
    readonly source: CdkCliSource
    /** Known without spawning only for a workspace-local install (read from its package.json). */
    readonly version?: string
}

/**
 * Resolve the `cdk` CLI for a given CDK app directory:
 *   1. `configured`, the `aws.cdk.cliPath` setting (escape hatch),
 *   2. workspace-local `node_modules/.bin/cdk` (the package manager's launcher, which honors the shebang),
 *   3. workspace-local `aws-cdk` package without a `.bin` link (run its bin script with `node`),
 *   4. `cdk` on PATH.
 * Returns undefined when nothing is found.
 */
export async function resolveCdkCli(
    appDir: string,
    env: NodeJS.ProcessEnv,
    configured: string | undefined
): Promise<ResolvedCdkCli | undefined> {
    if (configured) {
        if (await fs.existsFile(configured)) {
            return { command: configured, args: ['lsp'], source: 'setting' }
        }
        logger.warn(`aws.cdk.cliPath is set to a missing path: ${configured}`)
        return undefined
    }

    // Look for `node_modules/.bin/cdk` first, so that we run a local CDK exactly like the shell would.
    const localBin = await findLocalCdkBin(appDir)
    if (localBin) {
        return { command: localBin.command, args: ['lsp'], source: 'nodeModules', version: localBin.version }
    }

    // If a `.bin` script wasn't installed, may be that the package manager still put `aws-cdk` somewhere in `node_modules`.
    // Exploit our knowledge of the package layout to run the binary directly.
    const local = await findLocalCdkPackage(appDir)
    if (local) {
        // Running the package's bin script directly avoids npm's `.cmd` shim and therefore the shell.
        const node = await findOnPath('node', env)
        if (node) {
            return { command: node, args: [local.binScript, 'lsp'], source: 'nodeModules', version: local.version }
        }
        logger.warn(`Found aws-cdk at ${local.binScript} but no \`node\` on PATH`)
    }

    const onPath = await findOnPath('cdk', env)
    if (onPath) {
        return { command: onPath, args: ['lsp'], source: 'path' }
    }

    return undefined
}

/** Walk up from appDir looking for `node_modules/.bin/cdk`, and read the version of the `aws-cdk` next to it. */
async function findLocalCdkBin(appDir: string): Promise<{ command: string; version?: string } | undefined> {
    // npm/yarn/pnpm write a `.cmd` launcher on Windows; it is the only one Node can spawn there.
    const binName = process.platform === 'win32' ? 'cdk.cmd' : 'cdk'
    for (let dir = appDir; ; dir = path.dirname(dir)) {
        const nodeModules = path.join(dir, 'node_modules')
        const command = path.join(nodeModules, '.bin', binName)
        if (await fs.existsFile(command)) {
            return {
                command,
                version: (await readPackageJson(path.join(nodeModules, 'aws-cdk', 'package.json')))?.version,
            }
        }
        if (path.dirname(dir) === dir) {
            return undefined
        }
    }
}

/** Resolve the `aws-cdk` package the app would `require`, walking up from appDir like Node does. */
async function findLocalCdkPackage(appDir: string): Promise<{ binScript: string; version: string } | undefined> {
    let pkgJson: string
    try {
        pkgJson = createRequire(path.join(appDir, 'package.json')).resolve('aws-cdk/package.json')
    } catch {
        return undefined
    }
    const pkg = await readPackageJson(pkgJson)
    const bin = typeof pkg?.bin === 'string' ? pkg.bin : pkg?.bin?.cdk
    return bin ? { binScript: path.join(path.dirname(pkgJson), bin), version: pkg.version } : undefined
}

async function readPackageJson(file: string): Promise<any | undefined> {
    try {
        return JSON.parse(await fs.readFileText(file))
    } catch (err) {
        logger.warn(`Failed to read ${file}: %O`, err)
        return undefined
    }
}

/** `which`-style scan of env.PATH for an executable. */
async function findOnPath(name: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
    const rawPath = env.PATH ?? process.env.PATH ?? ''
    // A cdk on PATH may be an npm `.cmd` shim, a native `.exe`, or a POSIX binary;
    // npm never produces a `.bat`.
    const exts = process.platform === 'win32' ? ['.cmd', '.exe', ''] : ['']
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

/** True when `version` >= minimumCdkLspVersion. */
export function meetsMinimum(version: string): boolean {
    return semver.valid(version) !== null && semver.gte(version, minimumCdkLspVersion)
}
