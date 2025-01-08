/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* ---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto'
import { DevSettings } from '../settings'
import { getLogger } from '..'
import { ToolkitError } from '../errors'
import { userInfo } from 'os'
import path from 'path'
import { Timeout, CancellationError } from '../utilities/timeoutUtils'
import { IamConnection } from '../../auth/connection'
import { asEnvironmentVariables } from '../../auth/credentials/utils'
import { getIAMConnection } from '../../auth/utils'
import { ChildProcess } from '../utilities/processUtils'

let unixShellEnvPromise: Promise<typeof process.env | void> | undefined = undefined
let envCacheExpireTime: number

export interface IProcessEnvironment {
    [key: string]: string | undefined
}

function isLaunchedFromCli(env: IProcessEnvironment): boolean {
    return env['VSCODE_CLI'] === '1'
}
let terminalDefaultShellUnixLike: string | undefined = undefined
function getSystemShellUnixLike(env: IProcessEnvironment): string {
    if (process.platform === 'win32') {
        throw new ToolkitError(`Resolve Windows Shell not implemented`)
    }
    // check cache
    if (!terminalDefaultShellUnixLike) {
        let unixLikeTerminal: string | undefined

        unixLikeTerminal = env['SHELL']

        if (!unixLikeTerminal) {
            try {
                // It's possible for $SHELL to be unset, this API reads /etc/passwd. See https://github.com/github/codespaces/issues/1639
                // Node docs: "Throws a SystemError if a user has no username or homedir."
                unixLikeTerminal = userInfo().shell ?? undefined
            } catch (err) {}
        }

        if (!unixLikeTerminal) {
            unixLikeTerminal = 'sh'
        }

        // Some systems have $SHELL set to /bin/false which breaks the terminal
        if (unixLikeTerminal === '/bin/false') {
            unixLikeTerminal = '/bin/bash'
        }

        terminalDefaultShellUnixLike = unixLikeTerminal
    }
    return terminalDefaultShellUnixLike
}

export async function injectCredentials(conn: IamConnection, env = process.env): Promise<NodeJS.ProcessEnv> {
    const creds = await conn.getCredentials()
    return { ...env, ...asEnvironmentVariables(creds) }
}

export interface getEnvOptions {
    /** Controls whether to inject credential into env. (default: true) */
    injectCredential?: boolean
    /** only valid if injectCredential is true, prompt for invalid credential and ask for IAM credential (default: false) */
    promptForInvalidCredential?: boolean
    /** Inject resolved shell path into env. (default: true) */
    injectPath?: boolean
}

/**
 * Get the spawn environment, inject credentials and resolved shell path if needed
 * @param env NodeJS.process
 * @param injectCredential inject credential into env
 * @param promptForInvalidCredential: prompt for invalid credential and ask for IAM credential
 * @param injectPath inject resolved shell path into env
 * @returns the merged env to use for spawning a child process
 */
export async function getSpawnEnv(
    env: NodeJS.ProcessEnv | undefined = process.env,
    opts: getEnvOptions = {}
): Promise<typeof process.env> {
    const injectCredential = opts.injectCredential ?? true
    const promptForInvalidCredential = opts.promptForInvalidCredential ?? false
    const injectPath = opts.injectPath ?? true

    let mergedEnv = injectPath ? await mergeResolvedShellPath(env) : env

    if (injectCredential) {
        const connection = await getIAMConnection({ prompt: promptForInvalidCredential })
        if (connection?.type === 'iam' && connection.state === 'valid') {
            mergedEnv = await injectCredentials(connection, mergedEnv)
        }
    }

    return mergedEnv
}

/**
 * merge the resolved path into existing process.path
 * If no need to resolve or resolve failed, return the env arg directly
 * @param env NodeJS.process
 * @returns merged PATH
 */
export async function mergeResolvedShellPath(env: IProcessEnvironment): Promise<typeof process.env> {
    const shellEnv = await getResolvedShellEnv(env)
    // resolve failed or doesn't need to resolve
    if (!shellEnv) {
        return env
    }
    try {
        const envPaths: string[] = env.PATH ? env.PATH.split(path.delimiter) : []
        const resolvedPaths: string[] = shellEnv.PATH ? shellEnv.PATH.split(path.delimiter) : []
        const envReturn = { ...env }
        // merge, dedup, join
        envReturn.PATH = [...new Set(envPaths.concat(resolvedPaths))].join(path.delimiter)

        return envReturn
    } catch (err) {
        getLogger().error(`error merging env with resolved env:${err}`)
        return env
    }
}

/**
 * Resolves the shell environment by spawning a shell. This call will cache
 * the shell spawning so that subsequent invocations use that cached result.
 *
 * Will throw an error if:
 * - we hit a timeout of `MAX_SHELL_RESOLVE_TIME`
 * - any other error from spawning a shell to figure out the environment
 */
export async function getResolvedShellEnv(env?: IProcessEnvironment): Promise<typeof process.env | void> {
    if (!env) {
        env = process.env
    }
    // Skip if forceResolveEnv is set to false
    if (DevSettings.instance._isSet('forceResolveEnv') && !DevSettings.instance.get('forceResolveEnv', false)) {
        getLogger().debug('resolveShellEnv(): skipped (forceResolveEnv)')

        return undefined
    }

    // Skip on windows
    else if (process.platform === 'win32') {
        getLogger().debug('resolveShellEnv(): skipped (Windows)')

        return undefined
    }

    // Skip if running from CLI already and forceResolveEnv is not true
    else if (isLaunchedFromCli(env) && !DevSettings.instance.get('forceResolveEnv', false)) {
        getLogger().info('resolveShellEnv(): skipped (VSCODE_CLI is set)')

        return undefined
    }
    // Otherwise resolve (macOS, Linux)
    else {
        if (isLaunchedFromCli(env)) {
            getLogger().debug('resolveShellEnv(): running (forceResolveEnv)')
        } else {
            getLogger().debug('resolveShellEnv(): running (macOS/Linux)')
        }

        // Call this only once before expire and cache the promise for
        // subsequent calls since this operation can be expensive (spawns a process).
        if (!unixShellEnvPromise || Date.now() > envCacheExpireTime) {
            // cache valid for 5 minutes
            envCacheExpireTime = Date.now() + 5 * 60 * 1000
            unixShellEnvPromise = new Promise<NodeJS.ProcessEnv | void>(async (resolve, reject) => {
                const timeout = new Timeout(10000)

                // Resolve shell env and handle errors
                try {
                    const shellEnv = await doResolveUnixShellEnv(timeout)
                    if (shellEnv && Object.keys(shellEnv).length > 0) {
                        resolve(shellEnv)
                    } else {
                        resolve()
                    }
                } catch {
                    // failed resolve should not affect other feature.
                    resolve()
                }
            })
        }

        return unixShellEnvPromise
    }
}

async function doResolveUnixShellEnv(timeout: Timeout): Promise<typeof process.env> {
    const runAsNode = process.env['ELECTRON_RUN_AS_NODE']
    getLogger().debug(`getUnixShellEnvironment#runAsNode:${runAsNode}`)

    const noAttach = process.env['ELECTRON_NO_ATTACH_CONSOLE']
    getLogger().debug(`getUnixShellEnvironment#noAttach:${noAttach}`)

    const mark = crypto.randomUUID().replace(/-/g, '').substring(0, 12)
    const regex = new RegExp(mark + '({.*})' + mark)

    const env = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        ELECTRON_NO_ATTACH_CONSOLE: '1',
        VSCODE_RESOLVING_ENVIRONMENT: '1',
    }

    getLogger().debug(`getUnixShellEnvironment#env}`)
    const systemShellUnix = getSystemShellUnixLike(env)
    getLogger().debug(`getUnixShellEnvironment#shell:${systemShellUnix}`)

    return new Promise<typeof process.env>(async (resolve, reject) => {
        if (timeout.token.isCancellationRequested) {
            return reject(new CancellationError('timeout'))
        }

        // handle popular non-POSIX shells
        const name = path.basename(systemShellUnix)
        let command: string, shellArgs: Array<string>
        const extraArgs = ''
        if (/^pwsh(-preview)?$/.test(name)) {
            // Older versions of PowerShell removes double quotes sometimes so we use "double single quotes" which is how
            // you escape single quotes inside of a single quoted string.
            command = `& '${process.execPath}' ${extraArgs} -p '''${mark}'' + JSON.stringify(process.env) + ''${mark}'''`
            shellArgs = ['-Login', '-Command']
        } else if (name === 'nu') {
            // nushell requires ^ before quoted path to treat it as a command
            command = `^'${process.execPath}' ${extraArgs} -p '"${mark}" + JSON.stringify(process.env) + "${mark}"'`
            shellArgs = ['-i', '-l', '-c']
        } else if (name === 'xonsh') {
            // #200374: native implementation is shorter
            command = `import os, json; print("${mark}", json.dumps(dict(os.environ)), "${mark}")`
            shellArgs = ['-i', '-l', '-c']
        } else {
            command = `'${process.execPath}' ${extraArgs} -p '"${mark}" + JSON.stringify(process.env) + "${mark}"'`

            if (name === 'tcsh' || name === 'csh') {
                shellArgs = ['-ic']
            } else {
                shellArgs = ['-i', '-l', '-c']
            }
        }

        getLogger().debug(`getUnixShellEnvironment#spawn:%O, command:${command}`, shellArgs)

        const child = new ChildProcess(systemShellUnix, [...shellArgs, command], {
            spawnOptions: {
                detached: true,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: env,
            },
            timeout: timeout,
            collect: true,
        })

        await child.run().then((result) => {
            const stderrStr = result.stderr
            if (stderrStr.trim()) {
                getLogger().warn(`getUnixShellEnvironment#stderr:${stderrStr}`)
            }

            if (result.exitCode || result.signal) {
                reject(
                    new ToolkitError(
                        `Unexpected exit code from spawned shell (code ${result.exitCode}, signal ${result.signal})`
                    )
                )
            }

            const match = regex.exec(result.stdout)
            const rawStripped = match ? match[1] : '{}'

            try {
                const env = JSON.parse(rawStripped)

                if (runAsNode) {
                    env['ELECTRON_RUN_AS_NODE'] = runAsNode
                } else {
                    delete env['ELECTRON_RUN_AS_NODE']
                }

                if (noAttach) {
                    env['ELECTRON_NO_ATTACH_CONSOLE'] = noAttach
                } else {
                    delete env['ELECTRON_NO_ATTACH_CONSOLE']
                }

                delete env['VSCODE_RESOLVING_ENVIRONMENT']

                // https://github.com/microsoft/vscode/issues/22593#issuecomment-336050758
                delete env['XDG_RUNTIME_DIR']

                getLogger().debug(`getUnixShellEnvironment#result:${env}`)
                resolve(env)
            } catch (err) {
                getLogger().error('getUnixShellEnvironment#errorCaught %O', err)
                reject(err)
            }
        })
    })
}
