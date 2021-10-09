/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import * as vscode from 'vscode'
import * as mde from '../shared/clients/mdeClient'
import * as nls from 'vscode-nls'
import * as arnparse from '@aws-sdk/util-arn-parser'
import { ext } from '../shared/extensionGlobals'
import { getLogger } from '../shared/logger/logger'
import { ChildProcess } from '../shared/utilities/childProcess'
import { showMessageWithCancel, showViewLogsMessage } from '../shared/utilities/messages'
import { Commands } from '../shared/vscode/commands'
import { Window } from '../shared/vscode/window'
import { MdeRootNode } from './mdeRootNode'
import { isExtensionInstalledMsg } from '../shared/utilities/vsCodeUtils'
import { Timeout, waitTimeout, waitUntil } from '../shared/utilities/timeoutUtils'
import { execFileSync } from 'child_process'
import { VSCODE_EXTENSION_ID } from '../shared/extensions'
import { CreateEnvironmentRequest } from '../../types/clientmde'
import { createInputBox } from '../shared/ui/inputPrompter'
import { createCommonButtons } from '../shared/ui/buttons'
import { invalidArn } from '../shared/localizedText'

const localize = nls.loadMessageBundle()

/**
 * Best-effort attempt to start an MDE given an ID, showing a progress notifcation with a cancel button
 * TODO: may combine this progress stuff into some larger construct
 *
 * The cancel button does not abort the start, but rather alerts any callers that any operations that rely
 * on the MDE starting should not progress.
 *
 * @returns the environment on success, undefined otherwise
 */
export async function startMde(
    env: Pick<mde.MdeEnvironment, 'id'>,
    mdeClient: mde.MdeClient
): Promise<mde.MdeEnvironment | undefined> {
    // hard-coded timeout for now
    const TIMEOUT_LENGTH = 120000

    const timeout = new Timeout(TIMEOUT_LENGTH)
    const progress = await showMessageWithCancel(localize('AWS.mde.startMde.message', 'MDE'), timeout)
    progress.report({ message: localize('AWS.mde.startMde.checking', 'checking status...') })

    const pollMde = waitUntil(
        async () => {
            // technically this will continue to be called until it reaches its own timeout, need a better way to 'cancel' a `waitUntil`
            if (timeout.completed) {
                return
            }

            const resp = await mdeClient.getEnvironmentMetadata({ environmentId: env.id })

            if (resp?.status === 'STOPPED') {
                progress.report({ message: localize('AWS.mde.startMde.stopStart', 'resuming environment...') })
                await mdeClient.startEnvironment({ environmentId: env.id })
            } else {
                progress.report({
                    message: localize('AWS.mde.startMde.starting', 'waiting for environment...'),
                })
            }

            return resp?.actions?.devfile?.status === 'RUNNING' ? resp : undefined
        },
        { interval: 5000, timeout: TIMEOUT_LENGTH, truthy: true }
    )

    return waitTimeout(pollMde, timeout, {
        onExpire: () => (
            Window.vscode().showErrorMessage(
                localize('AWS.mde.startFailed', 'Timeout waiting for MDE environment: {0}', env.id)
            ),
            undefined
        ),
        onCancel: () => undefined,
    })
}

export async function mdeConnectCommand(
    args: Pick<mde.MdeEnvironment, 'id'>,
    region: string,
    window = Window.vscode()
): Promise<void> {
    if (!isExtensionInstalledMsg('ms-vscode-remote.remote-ssh', 'Remote SSH', 'Connecting to MDE')) {
        return
    }

    const mdeClient = await mde.MdeClient.create(region, mde.mdeEndpoint())

    const TIMEOUT_LENGTH = 120000
    const timeout = new Timeout(TIMEOUT_LENGTH)
    const progress = await showMessageWithCancel(localize('AWS.mde.startMde.message', 'MDE'), timeout)
    progress.report({ message: localize('AWS.mde.startMde.checking', 'checking status...') })

    let startErr: Error
    const pollMde = waitUntil(
        async () => {
            // Technically this will continue to be called until it reaches its
            // own timeout, need a better way to 'cancel' a `waitUntil`.
            if (timeout.completed) {
                return
            }

            const mdeMeta = await mdeClient.getEnvironmentMetadata({ environmentId: args.id })

            if (mdeMeta?.status === 'STOPPED') {
                progress.report({ message: localize('AWS.mde.startMde.stopStart', 'resuming environment...') })
                await mdeClient.startEnvironment({ environmentId: args.id })
            } else {
                progress.report({
                    message: localize('AWS.mde.startMde.starting', 'waiting for environment...'),
                })
            }

            if (mdeMeta?.actions?.devfile?.status !== 'RUNNING') {
                return undefined
            }

            try {
                const session = await mdeClient.startSession({
                    environmentId: args.id,
                    sessionConfiguration: {
                        ssh: {},
                    },
                })
                return session
            } catch (e) {
                startErr = e as Error
                return undefined
            }
        },
        { interval: 5000, timeout: TIMEOUT_LENGTH, truthy: true }
    )

    const session = await waitTimeout(pollMde, timeout, {
        onExpire: () => {
            if (startErr) {
                showViewLogsMessage(
                    localize('AWS.mde.sessionFailed', 'Failed to start session for MDE environment: {0}', args.id),
                    window
                )
            } else {
                window.showErrorMessage(
                    localize('AWS.mde.startFailed', 'Timeout waiting for MDE environment: {0}', args.id)
                )
            }
        },
        onCancel: () => undefined,
    })
    if (!session) {
        return
    }

    const vsc = `${vscode.env.appRoot}/bin/code`
    const cmd = new ChildProcess(
        true,
        vsc,
        {
            env: Object.assign(
                {
                    AWS_REGION: region,
                    AWS_MDE_ENDPOINT: mde.mdeEndpoint(),
                    AWS_MDE_SESSION: session.id,
                    AWS_MDE_STREAMURL: session.accessDetails.streamUrl,
                    AWS_MDE_TOKEN: session.accessDetails.tokenValue,
                },
                process.env
            ),
        },
        '--folder-uri',
        `vscode-remote://ssh-remote+aws-mde-${args.id}/projects`
    )

    // Note: `await` is intentionally not used.
    cmd.run(
        (stdout: string) => {
            getLogger().verbose(`MDE connect: ${args.id}: ${stdout}`)
        },
        (stderr: string) => {
            getLogger().verbose(`MDE connect: ${args.id}: ${stderr}`)
        }
    )
}

export async function mdeCreateCommand(
    node?: MdeRootNode,
    // this is just partial for now for testing
    // it should instead be pass-through to the create API
    options?: Partial<CreateEnvironmentRequest>,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<mde.MdeEnvironment | undefined> {
    const d = new Date()
    const dateYear = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(d)
    const dateMonth = new Intl.DateTimeFormat('en', { month: '2-digit' }).format(d)
    const dateDay = new Intl.DateTimeFormat('en', { day: '2-digit' }).format(d)
    const dateStr = `${dateYear}-${dateMonth}-${dateDay}`

    getLogger().debug('MDE: mdeCreateCommand called on node: %O', node)
    const label = `created-${dateStr}`

    const inputbox = createInputBox({
        value: '',
        placeholder: 'arn:aws:iam::541201481031:role/test-mde-1',
        title: localize('AWS.mde.inputRole', 'Enter a role ARN'),
        buttons: createCommonButtons(),
        validateInput: s => (arnparse.validate(s) ? undefined : invalidArn),
    })
    const roleArn = (await inputbox.prompt())?.toString()
    if (!roleArn) {
        return
    }

    try {
        const env = ext.mde.createEnvironment({
            instanceType: 'mde.large',
            // Persistent storage in Gb (0,16,32,64), 0 = no persistence.
            persistentStorage: { sizeInGiB: 0 },
            roleArn: roleArn,
            // sourceCode: [{ uri: 'https://github.com/neovim/neovim.git', branch: 'master' }],
            // definition: {
            //     shellImage: `"{"\"shellImage\"": "\"mcr.microsoft.com/vscode/devcontainers/go\""}"`,
            // },
            tags: {
                label: '', // Label = "tag with no value".
            },
            // instanceType: ...  // TODO?
            // ideRuntimes: ...  // TODO?
            ...options,
        })

        getLogger().info('MDE: created environment: %O', env)

        // TODO: MDE telemetry
        // recordEcrCreateRepository({ result: 'Succeeded' })
        return env
    } catch (e) {
        getLogger().error('MDE: failed to create %O: %O', label, e)
        showViewLogsMessage(localize('AWS.mde.createFailed', 'Failed to create MDE environment: {0}', label), window)
        // TODO: MDE telemetry
        // recordEcrCreateRepository({ result: 'Failed' })
    } finally {
        if (node !== undefined) {
            await commands.execute('aws.refreshAwsExplorerNode', node)
        } else {
            await commands.execute('aws.refreshAwsExplorer', true)
        }
    }
}

export async function mdeDeleteCommand(
    env: Pick<mde.MdeEnvironment, 'id'>,
    node?: MdeRootNode,
    commands = Commands.vscode()
): Promise<void> {
    const r = await ext.mde.deleteEnvironment({ environmentId: env.id })
    getLogger().info('%O', r?.status)
    if (node !== undefined) {
        await commands.execute('aws.refreshAwsExplorerNode', node)
    } else {
        await commands.execute('aws.refreshAwsExplorer', true)
    }
}

const SSH_AGENT_SOCKET_VARIABLE = 'SSH_AUTH_SOCK'

export async function cloneToMde(mde: mde.MdeEnvironment & { id: string }, repo: vscode.Uri): Promise<void> {
    const agentSock = startSshAgent()

    // For some reason git won't accept URIs with the 'ssh' scheme?
    const target = repo.scheme === 'ssh' ? `${repo.authority}${repo.path}` : repo.toString()
    // TODO: let user name the project (if they want)
    const repoName = repo.path.split('/').pop()?.split('.')[0]

    // TODO: could we parse for 'Permission denied (publickey).' and then tell user they need to add their SSH key to the agent?
    // TODO: handle different ports with the URI
    // TODO: test on windows?
    await new ChildProcess(
        true,
        `ssh`,
        { env: Object.assign({ [SSH_AGENT_SOCKET_VARIABLE]: agentSock }, process.env) },
        mde.id,
        '-o',
        'StrictHostKeyChecking=no',
        'AddKeysToAgent=yes',
        `mkdir -p ~/.ssh && mkdir -p /projects && touch ~/.ssh/known_hosts && ssh-keyscan github.com >> ~/.ssh/known_hosts && git clone '${target}' /projects/'${repoName}'`
    ).run(
        (stdout: string) => {
            getLogger().verbose(`MDE clone: ${mde.id}: ${stdout}`)
        },
        (stderr: string) => {
            getLogger().verbose(`MDE clone: ${mde.id}: ${stderr}`)
        }
    )
}

/**
 * Only mac has the agent running by default, other OS we need to start manually
 *
 * @returns `undefined` if agent is already running or on Windows, otherwise a shell script to set-up the agent
 */
function startSshAgent(): string | undefined {
    if (process.env[SSH_AGENT_SOCKET_VARIABLE] !== undefined) {
        return
    }

    try {
        if (os.platform() === 'win32') {
            // First check if it's running
            // if not, try to start it
            // if that fails, try to set the start-up type to manual
            // if that fails, then no agent
            const script = `
            $status = (Get-Service ssh-agent).Status
            if (status -eq "Running") { exit 0 }
            Start-Service ssh-agent
            if (!$?) {
                (Get-Service -Name ssh-agent | Set-Service -StartupType Manual) && Start-Service ssh-agent
            }
            exit $?
            `
            execFileSync('powershell.exe', ['Invoke-Expression', script])
            return
        }

        // TODO: this command outputs a shell command that you're supposed to execute, for now
        // we'll just parse the socket out and inject it into the ssh command
        return (execFileSync('ssh-agent', ['-s']).match(/$SSH_AGENT_VAR=(.*?);/) ?? [])[1]
    } catch (err) {
        getLogger().error('mde: failed to start SSH agent, clones may not work as expected: %O', err)
    }
}

// this could potentially install the toolkit without needing to mess with user settings
// but it's kind of awkward still since it needs to be ran after 'vscode-server' has been
// installed on the remote
export async function installToolkit(mde: Pick<mde.MdeEnvironment, 'id'>): Promise<void> {
    // TODO: check if dev mode is enabled, then install the development toolkit into the MDE
    await new ChildProcess(
        true,
        'ssh',
        undefined,
        mde.id,
        `find ~ -path '*.vscode-server/bin/*/bin/code' -exec {} --install-extension ${VSCODE_EXTENSION_ID.awstoolkit} \\;`
    ).run(
        stdout => getLogger().verbose(`MDE install toolkit: ${mde.id}: ${stdout}`),
        stderr => getLogger().verbose(`MDE install toolkit: ${mde.id}: ${stderr}`)
    )
}
