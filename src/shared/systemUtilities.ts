/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs-extra'
import * as vscode from 'vscode'
import * as os from 'os'
import * as path from 'path'
import { EnvironmentVariables } from './environmentVariables'
import { ChildProcess } from './utilities/childProcess'
import { getLogger } from './logger/logger'
import { GitExtension } from './extensions/git'
import { isCloud9 } from './extensionUtilities'
import { Settings } from './settings'

export class SystemUtilities {
    /** Full path to VSCode CLI. */
    private static vscPath: string
    private static sshPath: string
    private static gitPath: string
    private static bashPath: string
    private static fileNotFound = vscode.FileSystemError.FileNotFound().code

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

    public static async readFile(file: string | vscode.Uri): Promise<string> {
        const uri = typeof file === 'string' ? vscode.Uri.file(file) : file
        const decoder = new TextDecoder()

        if (isCloud9()) {
            return decoder.decode(await fs.readFile(uri.fsPath))
        }

        return decoder.decode(await vscode.workspace.fs.readFile(uri))
    }

    public static async writeFile(file: string | vscode.Uri, data: string | Buffer): Promise<void> {
        const uri = typeof file === 'string' ? vscode.Uri.file(file) : file
        const content = typeof data === 'string' ? new TextEncoder().encode(data) : data

        if (isCloud9()) {
            return fs.writeFile(uri.fsPath, content)
        }

        return vscode.workspace.fs.writeFile(uri, content)
    }

    public static async remove(dir: string | vscode.Uri): Promise<void> {
        const uri = typeof dir === 'string' ? vscode.Uri.file(dir) : dir

        if (isCloud9()) {
            return fs.remove(uri.fsPath)
        }

        return vscode.workspace.fs.delete(uri, { recursive: true })
    }

    public static async fileExists(file: string | vscode.Uri): Promise<boolean> {
        const uri = typeof file === 'string' ? vscode.Uri.file(file) : file

        if (isCloud9()) {
            return new Promise<boolean>(resolve => fs.access(uri.fsPath, err => resolve(!err)))
        }

        return vscode.workspace.fs.stat(uri).then(
            () => true,
            err => !(err instanceof vscode.FileSystemError && err.code === this.fileNotFound)
        )
    }

    public static async createDirectory(file: string | vscode.Uri): Promise<void> {
        const uri = typeof file === 'string' ? vscode.Uri.file(file) : file

        if (isCloud9()) {
            return fs.ensureDir(uri.fsPath)
        }

        return vscode.workspace.fs.createDirectory(uri)
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
            const proc = new ChildProcess(vsc, ['--version'])
            const r = await proc.run()
            if (r.exitCode === 0) {
                SystemUtilities.vscPath = vsc
                return vsc
            }
            getLogger().warn('getVscodeCliPath: failed: %s', proc)
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
            const result = await new ChildProcess(tsc, ['-v']).run()
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

        const sshSettingPath = Settings.instance.get('remote.ssh.path', String, '')
        const paths = [
            sshSettingPath,
            'ssh', // Try $PATH _before_ falling back to common paths.
            '/usr/bin/ssh',
            'C:/Windows/System32/OpenSSH/ssh.exe',
        ]
        for (const p of paths) {
            if (!p || ('ssh' !== p && !fs.existsSync(p))) {
                continue
            }
            const proc = new ChildProcess(p, ['-G', 'x'])
            const r = await proc.run()
            if (r.exitCode === 0) {
                SystemUtilities.sshPath = p
                return p
            }
            getLogger().warn('findSshPath: failed: %s', proc)
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
            if (!p || ('git' !== p && !fs.existsSync(p))) {
                continue
            }
            const proc = new ChildProcess(p, ['--version'])
            const r = await proc.run()
            if (r.exitCode === 0) {
                SystemUtilities.gitPath = p
                return p
            }
            getLogger().warn('findGitPath: failed: %s', proc)
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
            if (!p || ('bash' !== p && !fs.existsSync(p))) {
                continue
            }
            const proc = new ChildProcess(p, ['--version'])
            const r = await proc.run()
            if (r.exitCode === 0) {
                SystemUtilities.bashPath = p
                return p
            }
            getLogger().warn('findBashPath: failed: %s', proc)
        }
    }

    /**
     * Returns true if the current build is running on CI (build server).
     */
    public static isCI(): boolean {
        return undefined !== process.env['CODEBUILD_BUILD_ID']
    }
}
