/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
import * as vscode from 'vscode'
import * as os from 'os'
import * as path from 'path'
import { EnvironmentVariables } from './environmentVariables'
import { ChildProcess } from './utilities/childProcess'
import { getLogger } from './logger/logger'
import { DefaultSettingsConfiguration } from './settingsConfiguration'

export class SystemUtilities {
    /** Full path to VSCode CLI. */
    private static vscPath: string
    private static sshPath: string

    public static getHomeDirectory(): string {
        const env = process.env as EnvironmentVariables

        if (env.HOME !== undefined) {
            return env.HOME
        }
        if (env.USERPROFILE !== undefined) {
            return env.USERPROFILE
        }
        if (env.HOMEPATH !== undefined) {
            const homeDrive: string = env.HOMEDRIVE || 'C:'

            return path.join(homeDrive, env.HOMEPATH)
        }

        return os.homedir()
    }

    public static async fileExists(file: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            fs.access(file, err => {
                if (err) {
                    resolve(false)
                }

                resolve(true)
            })
        })
    }

    /**
     * Gets the fullpath to `code` (VSCode CLI), or falls back to "code" (not
     * absolute) if it works.
     *
     * @see https://github.com/microsoft/vscode-test/blob/4bdccd4c386813a8158b0f9b96f31cbbecbb3374/lib/util.ts#L133
     */
    public static async getVscodeCliPath(): Promise<string | undefined> {
        if (SystemUtilities.vscPath) {
            return SystemUtilities.vscPath
        }

        const vscExe = process.argv0
        // https://github.com/microsoft/vscode-test/blob/4bdccd4c386813a8158b0f9b96f31cbbecbb3374/lib/util.ts#L133
        const vscs = [
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
            if (vsc !== 'code' && !fs.existsSync(vsc)) {
                continue
            }
            const proc = new ChildProcess(true, vsc, undefined, '--version')
            const r = await proc.run()
            if (r.exitCode === 0) {
                SystemUtilities.vscPath = vsc
                return vsc
            }
            getLogger().warn('getVscodeCliPath: failed: %O', proc)
        }

        return undefined
    }

    /**
     * Searches for `tsc` in the current workspace, or the system (tries `tsc`
     * using current $PATH).
     *
     * @returns fullpath if found in the workspace, "tsc" if found in current $PATH, else undefined.
     */
    public static async findTypescriptCompiler(): Promise<string | undefined> {
        const foundUris = await vscode.workspace.findFiles('**/node_modules/.bin/{tsc,tsc.cmd}', undefined, 1)
        const tscPaths = []
        if (foundUris.length > 0) {
            tscPaths.push(foundUris[0].fsPath)
        }
        tscPaths.push('tsc') // Try this last.

        for (const tsc of tscPaths) {
            // Try to run "tsc -v".
            const result = await new ChildProcess(true, tsc, undefined, '-v').run()
            if (result.exitCode === 0 && result.stdout.includes('Version')) {
                return tsc
            }
        }

        return undefined
    }

    /**
     * Gets the configured `ssh` path, or falls back to "ssh" (not absolute),
     * or tries common locations, or returns undefined.
     */
    public static async findSshPath(): Promise<string | undefined> {
        if (SystemUtilities.sshPath !== undefined) {
            return SystemUtilities.sshPath
        }

        const settings = new DefaultSettingsConfiguration()
        const sshSettingPath = settings.getSetting<string>('remote.SSH.path', 'string', { silent: 'yes' })
        const paths = [
            sshSettingPath,
            'ssh', // Try $PATH _before_ falling back to common paths.
            '/usr/bin/ssh',
        ]
        for (const p of paths) {
            if (!p || ('ssh' !== p && !fs.existsSync(p))) {
                continue
            }
            const proc = new ChildProcess(true, p, undefined, '-G', 'x')
            const r = await proc.run()
            if (r.exitCode === 0) {
                SystemUtilities.sshPath = p
                return p
            }
            getLogger().warn('findSshPath: failed: %O', proc)
        }
    }

    /**
     * Returns true if the current build is running on CI (build server).
     */
    public static isCI(): boolean {
        return undefined !== process.env['CODEBUILD_BUILD_ID']
    }
}
