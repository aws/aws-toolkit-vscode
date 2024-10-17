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

/** Full path to VSCode CLI. */
let vscPath: string
let sshPath: string
let gitPath: string
let bashPath: string

/**
 * Tries to execute a program at path `p` with the given args and
 * optionally checks the output for `expected`.
 *
 * @param p path to a program to execute
 * @param args program args
 * @param doLog log failures
 * @param expected output must contain this string
 */
export async function tryRun(
    p: string,
    args: string[],
    logging: 'yes' | 'no' | 'noresult' = 'yes',
    expected?: string,
    opt?: ChildProcessOptions
): Promise<boolean> {
    const proc = new ChildProcess(p, args, { logging: 'no' })
    const r = await proc.run(opt)
    const ok = r.exitCode === 0 && (expected === undefined || r.stdout.includes(expected))
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
        if (await tryRun(tsc, ['-v'], 'yes', 'Version')) {
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
