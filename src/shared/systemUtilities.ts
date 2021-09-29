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

export class SystemUtilities {
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
}
