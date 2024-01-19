/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fsPromises } from 'fs'
import fs from 'fs'
import * as vscode from 'vscode'
import * as os from 'os'
import * as path from 'path'
import { EnvironmentVariables } from './environmentVariables'
import { ChildProcess } from './utilities/childProcess'
import { getLogger } from './logger/logger'
import { GitExtension } from './extensions/git'
import { isCloud9 } from './extensionUtilities'
import { Settings } from './settings'
import { PermissionsError, PermissionsTriplet, isFileNotFoundError, isNoPermissionsError } from './errors'

export function createPermissionsErrorHandler(
    uri: vscode.Uri,
    perms: PermissionsTriplet
): (err: unknown, depth?: number) => Promise<never> {
    return async function (err: unknown, depth = 0) {
        if (uri.scheme !== 'file' || process.platform === 'win32') {
            throw err
        }
        if (!isNoPermissionsError(err) && !(isFileNotFoundError(err) && depth > 0)) {
            throw err
        }

        const userInfo = os.userInfo({ encoding: 'utf-8' })
        const stats = await fsPromises.stat(uri.fsPath).catch(async err2 => {
            if (!isNoPermissionsError(err2) && !(isFileNotFoundError(err2) && perms[1] === 'w')) {
                throw err
            }

            throw await createPermissionsErrorHandler(vscode.Uri.joinPath(uri, '..'), '*wx')(err2, depth + 1)
        })

        throw new PermissionsError(uri, stats, userInfo, perms, err)
    }
}

export class SystemUtilities {
    /** Full path to VSCode CLI. */
    private static vscPath: string
    private static sshPath: string
    private static gitPath: string
    private static bashPath: string

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

    public static async readFile(file: string | vscode.Uri, decoder: TextDecoder = new TextDecoder()): Promise<string> {
        const uri = typeof file === 'string' ? vscode.Uri.file(file) : file
        const errorHandler = createPermissionsErrorHandler(uri, 'r**')

        if (isCloud9()) {
            return decoder.decode(await fsPromises.readFile(uri.fsPath).catch(errorHandler))
        }

        return decoder.decode(await vscode.workspace.fs.readFile(uri).then(undefined, errorHandler))
    }

    public static async writeFile(
        file: string | vscode.Uri,
        data: string | Buffer,
        opt?: fs.WriteFileOptions
    ): Promise<void> {
        const uri = typeof file === 'string' ? vscode.Uri.file(file) : file
        const errorHandler = createPermissionsErrorHandler(uri, '*w*')
        const content = typeof data === 'string' ? new TextEncoder().encode(data) : data

        if (isCloud9()) {
            return fsPromises.writeFile(uri.fsPath, content, opt).catch(errorHandler)
        }

        return vscode.workspace.fs.writeFile(uri, content).then(undefined, errorHandler)
    }

    public static async delete(fileOrDir: string | vscode.Uri, opt?: { recursive: boolean }): Promise<void> {
        const uri = typeof fileOrDir === 'string' ? vscode.Uri.file(fileOrDir) : fileOrDir
        const dirUri = vscode.Uri.joinPath(uri, '..')
        const errorHandler = createPermissionsErrorHandler(dirUri, '*wx')

        if (isCloud9()) {
            const stat = await fsPromises.stat(uri.fsPath)
            if (stat.isDirectory()) {
                return fsPromises.rmdir(uri.fsPath).catch(errorHandler)
            } else {
                return fsPromises.unlink(uri.fsPath).catch(errorHandler)
            }
        }

        if (opt?.recursive) {
            // We shouldn't catch any errors if using the `recursive` option, otherwise the
            // error messages may be misleading. Need to implement our own recursive delete
            // if we want detailed info.
            return vscode.workspace.fs.delete(uri, opt)
        } else {
            // Attempting to delete a file in a directory without `x` results in ENOENT.
            // But this might not be true. The file could exist, we just don't know about it.
            return vscode.workspace.fs.delete(uri, opt).then(undefined, async err => {
                if (isNoPermissionsError(err)) {
                    throw await errorHandler(err)
                } else if (uri.scheme !== 'file' || !isFileNotFoundError(err) || process.platform === 'win32') {
                    throw err
                } else {
                    const stats = await fsPromises.stat(dirUri.fsPath).catch(() => {
                        throw err
                    })
                    if ((stats.mode & fs.constants.S_IXUSR) === 0) {
                        const userInfo = os.userInfo({ encoding: 'utf-8' })
                        throw new PermissionsError(dirUri, stats, userInfo, '*wx', err)
                    }
                }

                throw err
            })
        }
    }

    public static async fileExists(file: string | vscode.Uri): Promise<boolean> {
        const uri = typeof file === 'string' ? vscode.Uri.file(file) : file

        if (isCloud9()) {
            return fsPromises.access(uri.fsPath, fs.constants.F_OK).then(
                () => true,
                () => false
            )
        }

        return vscode.workspace.fs.stat(uri).then(
            () => true,
            err => !isFileNotFoundError(err)
        )
    }

    public static async createDirectory(file: string | vscode.Uri): Promise<void> {
        const uri = typeof file === 'string' ? vscode.Uri.file(file) : file
        const errorHandler = createPermissionsErrorHandler(vscode.Uri.joinPath(uri, '..'), '*wx')

        if (isCloud9()) {
            return fsPromises
                .mkdir(uri.fsPath, { recursive: true })
                .then(() => {})
                .catch(errorHandler)
        }

        return vscode.workspace.fs.createDirectory(uri).then(undefined, errorHandler)
    }

    private static get modeMap() {
        return {
            '*': 0,
            r: fs.constants.R_OK,
            w: fs.constants.W_OK,
            x: fs.constants.X_OK,
        } as const
    }

    /**
     * Checks if the current user has _at least_ the specified permissions.
     *
     * This throws {@link PermissionsError} when permissions are insufficient.
     */
    public static async checkPerms(file: string | vscode.Uri, perms: PermissionsTriplet): Promise<void> {
        const uri = typeof file === 'string' ? vscode.Uri.file(file) : file
        const errorHandler = createPermissionsErrorHandler(uri, perms)
        const flags = Array.from(perms) as (keyof typeof this.modeMap)[]
        const mode = flags.reduce((m, f) => m | this.modeMap[f], fs.constants.F_OK)

        return fsPromises.access(uri.fsPath, mode).catch(errorHandler)
    }

    // TODO: implement this by checking the file mode
    // public static async checkExactPerms(file: string | vscode.Uri, perms: `${PermissionsTriplet}${PermissionsTriplet}${PermissionsTriplet}`)

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
        expected?: string
    ): Promise<boolean> {
        const proc = new ChildProcess(p, args, { logging: 'no' })
        const r = await proc.run()
        const ok = r.exitCode === 0 && (expected === undefined || r.stdout.includes(expected))
        if (logging === 'noresult') {
            getLogger().info('tryRun: %s: %s', ok ? 'ok' : 'failed', proc)
        } else if (logging !== 'no') {
            getLogger().info('tryRun: %s: %s %O', ok ? 'ok' : 'failed', proc, proc.result())
        }
        return ok
    }

    // TODO: implement this by checking the file mode
    // public static async checkExactPerms(file: string | vscode.Uri, perms: `${PermissionsTriplet}${PermissionsTriplet}${PermissionsTriplet}`)

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
            if (!vsc || (vsc !== 'code' && !(await this.fileExists(vsc)))) {
                continue
            }
            if (await SystemUtilities.tryRun(vsc, ['--version'])) {
                SystemUtilities.vscPath = vsc
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
    public static async findTypescriptCompiler(): Promise<string | undefined> {
        const foundUris = await vscode.workspace.findFiles('**/node_modules/.bin/{tsc,tsc.cmd}', undefined, 1)
        const tscPaths = []
        if (foundUris.length > 0) {
            tscPaths.push(foundUris[0].fsPath)
        }
        tscPaths.push('tsc') // Try this last.

        for (const tsc of tscPaths) {
            // Try to run "tsc -v".
            if (await SystemUtilities.tryRun(tsc, ['-v'], 'yes', 'Version')) {
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

        const sshSettingPath = Settings.instance.get('remote.SSH.path', String, '')
        const paths = [
            sshSettingPath,
            'ssh', // Try $PATH _before_ falling back to common paths.
            '/usr/bin/ssh',
            'C:/Windows/System32/OpenSSH/ssh.exe',
            'C:/Program Files/Git/usr/bin/ssh.exe',
        ]
        for (const p of paths) {
            if (!p || ('ssh' !== p && !(await this.fileExists(p)))) {
                continue
            }
            if (await SystemUtilities.tryRun(p, ['-G', 'x'], 'noresult' /* "ssh -G" prints quasi-sensitive info. */)) {
                SystemUtilities.sshPath = p
                return p
            }
        }
    }

    /**
     * Gets the configured `git` path, or falls back to "ssh" (not absolute),
     * or tries common locations, or returns undefined.
     */
    public static async findGitPath(): Promise<string | undefined> {
        if (SystemUtilities.gitPath !== undefined) {
            return SystemUtilities.gitPath
        }
        const git = GitExtension.instance

        const paths = [git.gitPath, 'git']
        for (const p of paths) {
            if (!p || ('git' !== p && !(await this.fileExists(p)))) {
                continue
            }
            if (await SystemUtilities.tryRun(p, ['--version'])) {
                SystemUtilities.gitPath = p
                return p
            }
        }
    }

    /**
     * Gets a working `bash`, or undefined.
     */
    public static async findBashPath(): Promise<string | undefined> {
        if (SystemUtilities.bashPath !== undefined) {
            return SystemUtilities.bashPath
        }

        const paths = ['bash', 'C:/Program Files/Git/usr/bin/bash.exe', 'C:/Program Files (x86)/Git/usr/bin/bash.exe']
        for (const p of paths) {
            if (!p || ('bash' !== p && !(await this.fileExists(p)))) {
                continue
            }
            if (await SystemUtilities.tryRun(p, ['--version'])) {
                SystemUtilities.bashPath = p
                return p
            }
        }
    }
}
