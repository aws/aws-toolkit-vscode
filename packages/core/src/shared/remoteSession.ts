/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { Settings } from '../shared/settings'
import { showConfirmationMessage, showMessageWithCancel } from './utilities/messages'
import { CancellationError, Timeout } from './utilities/timeoutUtils'
import { isExtensionInstalled, showInstallExtensionMsg } from './utilities/vsCodeUtils'
import { VSCODE_EXTENSION_ID, vscodeExtensionMinVersion } from './extensions'
import { Err, Result } from '../shared/utilities/result'
import { ToolkitError, UnknownError } from './errors'
import { getLogger } from './logger/logger'
import { getOrInstallCli } from './utilities/cliUtils'
import { pushIf } from './utilities/collectionUtils'
import { ChildProcess } from './utilities/processUtils'
import { findSshPath, getVscodeCliPath } from './utilities/pathFind'
import { IamClient } from './clients/iamClient'
import { IAM } from 'aws-sdk'
import { getIdeProperties } from './extensionUtilities'

const policyAttachDelay = 5000

export interface MissingTool {
    readonly name: 'code' | 'ssm' | 'ssh'
    readonly reason?: string
}

export const minimumSsmActions = [
    'ssmmessages:CreateControlChannel',
    'ssmmessages:CreateDataChannel',
    'ssmmessages:OpenControlChannel',
    'ssmmessages:OpenDataChannel',
    'ssm:DescribeAssociation',
    'ssm:ListAssociations',
    'ssm:UpdateInstanceInformation',
]

export async function openRemoteTerminal(options: vscode.TerminalOptions, onClose: () => void) {
    const timeout = new Timeout(60000)

    await showMessageWithCancel('AWS: Starting session...', timeout, 1000)
    await withoutShellIntegration(async () => {
        const terminal = vscode.window.createTerminal(options)

        const listener = vscode.window.onDidCloseTerminal((t) => {
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

export type EnvProvider = () => Promise<NodeJS.ProcessEnv>

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

    return r.mapErr((e) => UnknownError.cast(e).message)
}

export async function ensureTools() {
    const [vsc, ssh, ssm] = await Promise.all([getVscodeCliPath(), findSshPath(), ensureSsmCli()])

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
        .map((d) => d.name)
        .join(', ')
    const msg = localize(
        'AWS.codecatalyst.missingRequiredTool',
        'Failed to connect to Dev Environment, missing required tools: {0}',
        missing
    )

    tools.err().forEach((d) => {
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

function getFormattedSsmActions() {
    const formattedActions = minimumSsmActions.map((action) => `"${action}",\n`).reduce((l, r) => l + r)

    return formattedActions.slice(0, formattedActions.length - 2)
}

/**
 * Shows a progress message for adding inline policy to the role, then adds the policy.
 * Importantly, it keeps the progress bar up for `policyAttachDelay` additional ms to allow permissions to propagate.
 * If user cancels, it throws a CancellationError and stops the process from subsequently opening a connection.
 * @param client IamClient to be use to add the permissions.
 * @param roleArn Arn of the role the inline policy should be added to.
 */
async function addInlinePolicyWithDelay(client: IamClient, roleArn: string) {
    const timeout = new Timeout(policyAttachDelay)
    const message = `Adding Inline Policy to ${roleArn}`
    await showMessageWithCancel(message, timeout)
    await addSsmActionsToInlinePolicy(client, roleArn)

    function delay(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }

    await delay(policyAttachDelay)
    if (timeout.elapsedTime < policyAttachDelay) {
        throw new CancellationError('user')
    }
    timeout.cancel()
}

export async function promptToAddInlinePolicy(client: IamClient, roleArn: string): Promise<boolean> {
    const promptText = `${
        getIdeProperties().company
    } Toolkit will add required actions to role ${roleArn}:\n${getFormattedSsmActions()}`
    const confirmation = await showConfirmationMessage({ prompt: promptText, confirm: 'Approve' })

    if (confirmation) {
        await addInlinePolicyWithDelay(client, roleArn)
    }

    return confirmation
}

async function addSsmActionsToInlinePolicy(client: IamClient, roleArn: string) {
    const policyName = 'AWSVSCodeRemoteConnect'
    const policyDocument = getSsmPolicyDocument()
    await client.putRolePolicy(roleArn, policyName, policyDocument)
}

function getSsmPolicyDocument() {
    return `{
            "Version": "2012-10-17",
            "Statement": {
                "Effect": "Allow",
                "Action": [
                    ${getFormattedSsmActions()}
                ],
                "Resource": "*"
                }
            }`
}

export async function getDeniedSsmActions(client: IamClient, roleArn: string): Promise<IAM.EvaluationResult[]> {
    const deniedActions = await client.getDeniedActions({
        PolicySourceArn: roleArn,
        ActionNames: minimumSsmActions,
    })

    return deniedActions
}

/**
 * Creates a new {@link ChildProcess} class bound to a specific remote environment. All instances of this
 * derived class will have SSM session information injected as environment variables as-needed.
 */
export function createBoundProcess(envProvider: EnvProvider): typeof ChildProcess {
    type Run = ChildProcess['run']
    return class SessionBoundProcess extends ChildProcess {
        public override async run(...args: Parameters<Run>): ReturnType<Run> {
            const options = args[0]
            const envVars = await envProvider()
            const spawnOptions = {
                ...options?.spawnOptions,
                env: { ...envVars, ...options?.spawnOptions?.env },
            }

            return super.run({ ...options, spawnOptions })
        }
    }
}
