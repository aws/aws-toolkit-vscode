/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { Settings } from '../shared/settings'
import { showMessageWithCancel } from './utilities/messages'
import { CancellationError, Timeout } from './utilities/timeoutUtils'
import { isExtensionInstalled, showInstallExtensionMsg } from './utilities/vsCodeUtils'
import { VSCODE_EXTENSION_ID, vscodeExtensionMinVersion } from './extensions'
import { Err, Result } from '../shared/utilities/result'
import { ToolkitError, UnknownError } from './errors'
import { getLogger } from './logger/logger'
import { SystemUtilities } from './systemUtilities'
import { getOrInstallCli } from './utilities/cliUtils'
import { pushIf } from './utilities/collectionUtils'
import { ChildProcess } from './utilities/childProcess'

export interface MissingTool {
    readonly name: 'code' | 'ssm' | 'ssh'
    readonly reason?: string
}

export async function openRemoteTerminal(options: vscode.TerminalOptions, onClose: () => void) {
    const timeout = new Timeout(60000)

    await showMessageWithCancel('AWS: Starting session...', timeout, 1000)
    await withoutShellIntegration(async () => {
        const terminal = vscode.window.createTerminal(options)

        const listener = vscode.window.onDidCloseTerminal(t => {
            if (t.processId === terminal.processId) {
                vscode.Disposable.from(listener, { dispose: onClose }).dispose()
            }
        })

        terminal.show()
    }).finally(() => timeout.cancel())
}

/**
 * VSC is logging args to the PTY host log file if shell integration is enabled :(
 */
async function withoutShellIntegration<T>(cb: () => T | Promise<T>): Promise<T> {
    const userValue = Settings.instance.get('terminal.integrated.shellIntegration.enabled', Boolean)

    try {
        await Settings.instance.update('terminal.integrated.shellIntegration.enabled', false)
        return await cb()
    } finally {
        await Settings.instance.update('terminal.integrated.shellIntegration.enabled', userValue)
    }
}

interface DependencyPaths {
    readonly vsc: string
    readonly ssm: string
    readonly ssh: string
}

type EnvProvider = () => Promise<NodeJS.ProcessEnv>

export interface VscodeRemoteConnection {
    readonly sshPath: string
    readonly vscPath: string
    readonly hostname: string
    readonly envProvider: EnvProvider
    readonly SessionProcess: typeof ChildProcess
}

export async function ensureDependencies(): Promise<Result<DependencyPaths, CancellationError | Error>> {
    try {
        await ensureRemoteSshInstalled()
    } catch (e) {
        return Result.err(e as Error)
    }

    const tools = await ensureTools()
    if (tools.isErr()) {
        return await handleMissingTool(tools)
    }

    return tools
}

export async function ensureRemoteSshInstalled(): Promise<void> {
    if (!isExtensionInstalled(VSCODE_EXTENSION_ID.remotessh, vscodeExtensionMinVersion.remotessh)) {
        showInstallExtensionMsg(
            VSCODE_EXTENSION_ID.remotessh,
            'Remote SSH',
            'Connecting to Dev Environment',
            vscodeExtensionMinVersion.remotessh
        )

        if (isExtensionInstalled(VSCODE_EXTENSION_ID.remotessh)) {
            throw new ToolkitError('Remote SSH extension version is too low', {
                cancelled: true,
                code: 'ExtensionVersionTooLow',
                details: { expected: vscodeExtensionMinVersion.remotessh },
            })
        } else {
            throw new ToolkitError('Remote SSH extension not installed', {
                cancelled: true,
                code: 'MissingExtension',
            })
        }
    }
}

/**
 * Checks if the SSM plugin CLI `session-manager-plugin` is available and
 * working, else prompts user to install it.
 *
 * @returns Result object indicating whether the SSH config is working, or failure reason.
 */
async function ensureSsmCli() {
    const r = await Result.promise(getOrInstallCli('session-manager-plugin', false))

    return r.mapErr(e => UnknownError.cast(e).message)
}

export async function ensureTools() {
    const [vsc, ssh, ssm] = await Promise.all([
        SystemUtilities.getVscodeCliPath(),
        SystemUtilities.findSshPath(),
        ensureSsmCli(),
    ])

    const missing: MissingTool[] = []
    pushIf(missing, vsc === undefined, { name: 'code' })
    pushIf(missing, ssh === undefined, { name: 'ssh' })

    if (ssm.isErr()) {
        missing.push({ name: 'ssm', reason: ssm.err() })
    }

    if (vsc === undefined || ssh === undefined || ssm.isErr()) {
        return Result.err(missing)
    }

    return Result.ok({ vsc, ssh, ssm: ssm.ok() })
}

export async function handleMissingTool(tools: Err<MissingTool[]>) {
    const missing = tools
        .err()
        .map(d => d.name)
        .join(', ')
    const msg = localize(
        'AWS.codecatalyst.missingRequiredTool',
        'Failed to connect to Dev Environment, missing required tools: {0}',
        missing
    )

    tools.err().forEach(d => {
        if (d.reason) {
            getLogger().error(`codecatalyst: failed to get tool "${d.name}": ${d.reason}`)
        }
    })

    return Result.err(
        new ToolkitError(msg, {
            code: 'MissingTools',
            details: { missing },
        })
    )
}
