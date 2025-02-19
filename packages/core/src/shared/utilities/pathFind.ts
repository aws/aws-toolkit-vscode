/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import fs from '../../shared/fs/fs'
import { ChildProcess, ChildProcessOptions } from './processUtils'
import { GitExtension } from '../extensions/git'
import { Settings } from '../settings'
import { getLogger } from '../logger/logger'
import { mergeResolvedShellPath } from '../env/resolveEnv'
import { AcceptPattern, matchesPattern } from './textUtilities'

/** Full path to VSCode CLI. */
let vscPath: string
let sshPath: string
let gitPath: string
let bashPath: string
const pathMap = new Map<string, string>()

/**
 * Tries to execute a program at path `p` with the given args and
 * optionally checks the output for `expected`.
 *
 * @param p path to a program to execute
 * @param args program args
 * @param doLog log failures
 * @param expectedPattern pattern to match in the output
 * @param opt additional options for the Child Process
 * @returns true if the program was found and executed successfully
 */
export async function tryRun(
    p: string,
    args: string[],
    logging: 'yes' | 'no' | 'noresult' = 'yes',
    expectedPattern?: AcceptPattern,
    opt?: ChildProcessOptions
): Promise<boolean> {
    const proc = new ChildProcess(p, args, { logging: 'no' })
    const r = await proc.run({
        ...opt,
        spawnOptions: { env: await mergeResolvedShellPath(opt?.spawnOptions?.env ?? process.env) },
    })
    const ok = r.exitCode === 0 && matchesPattern(r.stdout, expectedPattern ?? {})
    if (logging === 'noresult') {
        getLogger().info('tryRun: %s: %s', ok ? 'ok' : 'failed', proc)
    } else if (logging !== 'no') {
        getLogger().info('tryRun: %s: %s %O', ok ? 'ok' : 'failed', proc, proc.result())
    }
    return ok
}

/**
 * Gets the fullpath to `code` (VSCode CLI), or falls back to "code" (not
 * absolute) if it works.
 *
 * @see https://github.com/microsoft/vscode-test/blob/4bdccd4c386813a8158b0f9b96f31cbbecbb3374/lib/util.ts#L133
 */
export async function getVscodeCliPath(): Promise<string | undefined> {
    if (vscPath) {
        return vscPath
    }

    const vscExe = process.argv0
    // https://github.com/microsoft/vscode-test/blob/4bdccd4c386813a8158b0f9b96f31cbbecbb3374/lib/util.ts#L133
    const vscs = [
        // Special case for flatpak (steamdeck). #V896741845
        // https://github.com/flathub/com.visualstudio.code/blob/master/code.sh
        '/app/bin/code',
        // Note: macOS does not have a separate "code-insiders" binary.
        path.resolve(`${vscode.env.appRoot}/bin/code`), // macOS
        path.resolve(`${vscode.env.appRoot}/../../bin/code`), // Windows
        path.resolve(`${vscode.env.appRoot}/../../bin/code-insiders`), // Windows
        // Linux example "appRoot": vscode-linux-x64-1.42.0/VSCode-linux-x64/resources/app
        path.resolve(`${vscode.env.appRoot}/code`),
        path.resolve(vscExe, '../bin/code-insiders'),
        path.resolve(vscExe, '../bin/code'),
        path.resolve(vscExe, '../../bin/code-insiders'),
        path.resolve(vscExe, '../../bin/code'),
        '/usr/bin/code',
        'code', // $PATH
    ]
    for (const vsc of vscs) {
        if (!vsc || (vsc !== 'code' && !(await fs.exists(vsc)))) {
            continue
        }
        if (await tryRun(vsc, ['--version'])) {
            vscPath = vsc
            return vsc
        }
    }

    return undefined
}

/**
 * Searches for `tsc` in the current workspace, or the system (tries `tsc`
 * using current $PATH).
 *
 * @returns fullpath if found in the workspace, "tsc" if found in current $PATH, else undefined.
 */
export async function findTypescriptCompiler(): Promise<string | undefined> {
    const foundUris = await vscode.workspace.findFiles('**/node_modules/.bin/{tsc,tsc.cmd}', undefined, 1)
    const tscPaths = []
    if (foundUris.length > 0) {
        tscPaths.push(foundUris[0].fsPath)
    }
    tscPaths.push('tsc') // Try this last.

    for (const tsc of tscPaths) {
        // Try to run "tsc -v".
        if (await tryRun(tsc, ['-v'], 'yes', { positive: 'Version' })) {
            return tsc
        }
    }

    return undefined
}

/**
 * Gets the configured `ssh` path, or falls back to "ssh" (not absolute),
 * or tries common locations, or returns undefined.
 */
export async function findSshPath(useCache: boolean = true): Promise<string | undefined> {
    if (useCache && sshPath !== undefined) {
        return sshPath
    }

    const sshSettingPath = Settings.instance.get('remote.SSH.path', String, '')
    const paths = [
        sshSettingPath,
        'ssh', // Try $PATH _before_ falling back to common paths.
        '/usr/bin/ssh',
        'C:/Windows/System32/OpenSSH/ssh.exe',
        'C:/Program Files/Git/usr/bin/ssh.exe',
    ]
    for (const p of paths) {
        if (!p || ('ssh' !== p && !(await fs.exists(p)))) {
            continue
        }
        if (await tryRun(p, ['-G', 'x'], 'noresult' /* "ssh -G" prints quasi-sensitive info. */)) {
            sshPath = useCache ? p : sshPath
            return p
        }
    }
}

/**
 * Gets the configured `git` path, or falls back to "ssh" (not absolute),
 * or tries common locations, or returns undefined.
 */
export async function findGitPath(): Promise<string | undefined> {
    if (gitPath !== undefined) {
        return gitPath
    }
    const git = GitExtension.instance

    const paths = [git.gitPath, 'git']
    for (const p of paths) {
        if (!p || ('git' !== p && !(await fs.exists(p)))) {
            continue
        }
        if (await tryRun(p, ['--version'])) {
            gitPath = p
            return p
        }
    }
}

/**
 * Gets a working `bash`, or undefined.
 */
export async function findBashPath(): Promise<string | undefined> {
    if (bashPath !== undefined) {
        return bashPath
    }

    const paths = ['bash', 'C:/Program Files/Git/usr/bin/bash.exe', 'C:/Program Files (x86)/Git/usr/bin/bash.exe']
    for (const p of paths) {
        if (!p || ('bash' !== p && !(await fs.exists(p)))) {
            continue
        }
        if (await tryRun(p, ['--version'])) {
            bashPath = p
            return p
        }
    }
}

/**
 * Gets a working `name` in $PATH or `paths`. If found, try to run the command with `verifyArgs`.
 *
 * @param name the name of executable, E.g. aws|sam|docker
 * @param paths An array of path to search
 * @param verifyArgs the array of verify args to run the found executable. typically ['--version']
 * @returns If found and valid, return a executable path of `name`, else undefined
 */
export async function findPath(
    name: string,
    paths: Array<string>,
    verifyArgs: Array<string>
): Promise<string | undefined> {
    // get from cache
    if (pathMap && pathMap.get(name)) {
        return pathMap.get(name)
    }
    // name found in path
    if (await tryRun(name, verifyArgs)) {
        pathMap.set(name, name)
        return name
    }
    // find working paths
    for (const p of paths) {
        if (!p || !(await fs.exists(p))) {
            continue
        }
        if (await tryRun(p, verifyArgs)) {
            pathMap.set(name, p)
            return p
        }
    }
}
