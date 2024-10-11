/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import fs from '../fs/fs'
import { ChildProcess, ChildProcessOptions } from './processUtils'
import { GitExtension } from '../extensions/git'
import { Settings } from '../settings'
import { getLogger } from '../logger/logger'

type searchablePath = 'vsc' | 'ssh' | 'git' | 'bash' | 'tsc'

export class PathFinder {
    private cachedPaths: Map<searchablePath, string>

    public constructor() {
        this.cachedPaths = new Map<searchablePath, string>()
    }
    static #instance: PathFinder
    static get instance(): PathFinder {
        return (this.#instance ??= new PathFinder())
    }

    /**
     * Tries to execute a program at path `p` with the given args and
     * optionally checks the output for `expected`.
     *
     * @param p path to a program to execute
     * @param args program args
     * @param doLog log failures
     * @param expected output must contain this string
     */
    public static async tryRun(
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

    public async getVscodeCliPath(): Promise<string | undefined> {
        if (this.cachedPaths.has('vsc')) {
            return this.cachedPaths.get('vsc')
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
            if (await PathFinder.tryRun(vsc, ['--version'])) {
                this.cachedPaths.set('vsc', vsc)
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
    public async findTypescriptCompiler(): Promise<string | undefined> {
        if (this.cachedPaths.has('tsc')) {
            return this.cachedPaths.get('tsc')
        }
        const foundUris = await vscode.workspace.findFiles('**/node_modules/.bin/{tsc,tsc.cmd}', undefined, 1)
        const tscPaths = []
        if (foundUris.length > 0) {
            tscPaths.push(foundUris[0].fsPath)
        }
        tscPaths.push('tsc') // Try this last.

        for (const tsc of tscPaths) {
            // Try to run "tsc -v".
            if (await PathFinder.tryRun(tsc, ['-v'], 'yes', 'Version')) {
                this.cachedPaths.set('tsc', tsc)
                return tsc
            }
        }

        return undefined
    }

    /**
     * Gets the configured `ssh` path, or falls back to "ssh" (not absolute),
     * or tries common locations, or returns undefined.
     */
    public async findSshPath(): Promise<string | undefined> {
        if (this.cachedPaths.has('ssh')) {
            return this.cachedPaths.get('ssh')
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
            if (await PathFinder.tryRun(p, ['-G', 'x'], 'noresult' /* "ssh -G" prints quasi-sensitive info. */)) {
                this.cachedPaths.set('ssh', p)
                return p
            }
        }
    }

    /**
     * Gets the configured `git` path, or falls back to "ssh" (not absolute),
     * or tries common locations, or returns undefined.
     */
    public async findGitPath(): Promise<string | undefined> {
        if (this.cachedPaths.has('git')) {
            return this.cachedPaths.get('git')
        }
        const git = GitExtension.instance

        const paths = [git.gitPath, 'git']
        for (const p of paths) {
            if (!p || ('git' !== p && !(await fs.exists(p)))) {
                continue
            }
            if (await PathFinder.tryRun(p, ['--version'])) {
                this.cachedPaths.set('git', p)
                return p
            }
        }
    }

    /**
     * Gets a working `bash`, or undefined.
     */
    public async findBashPath(): Promise<string | undefined> {
        if (this.cachedPaths.has('bash')) {
            this.cachedPaths.get('bash')
        }

        const paths = ['bash', 'C:/Program Files/Git/usr/bin/bash.exe', 'C:/Program Files (x86)/Git/usr/bin/bash.exe']
        for (const p of paths) {
            if (!p || ('bash' !== p && !(await fs.exists(p)))) {
                continue
            }
            if (await PathFinder.tryRun(p, ['--version'])) {
                this.cachedPaths.set('bash', p)
                return p
            }
        }
    }
}

export const pathFinder = PathFinder.instance
export default pathFinder
