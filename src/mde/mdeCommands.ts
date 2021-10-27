/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import * as vscode from 'vscode'
import * as awsArn from '@aws-sdk/util-arn-parser'
import * as mde from '../shared/clients/mdeClient'
import * as nls from 'vscode-nls'
import { ext } from '../shared/extensionGlobals'
import { getLogger } from '../shared/logger/logger'
import { ChildProcess } from '../shared/utilities/childProcess'
import { showConfirmationMessage, showMessageWithCancel, showViewLogsMessage } from '../shared/utilities/messages'
import { Commands } from '../shared/vscode/commands'
import { Window } from '../shared/vscode/window'
import { MdeRootNode } from './mdeRootNode'
import { isExtensionInstalledMsg } from '../shared/utilities/vsCodeUtils'
import { Timeout, waitTimeout, waitUntil } from '../shared/utilities/timeoutUtils'
import { execFileSync } from 'child_process'
import { ExtContext, VSCODE_EXTENSION_ID } from '../shared/extensions'
import { CreateEnvironmentRequest, DeleteEnvironmentResponse, TagMap } from '../../types/clientmde'
import { SystemUtilities } from '../shared/systemUtilities'
import { createMdeWebview } from './vue/create/backend'
import * as mdeModel from './mdeModel'
import { productName } from '../shared/constants'
import { VSCODE_MDE_TAGS } from './constants'
import { localizedDelete } from '../shared/localizedText'
import { MDE_RESTART_KEY } from './constants'
import { DefaultSettingsConfiguration } from '../shared/settingsConfiguration'

const localize = nls.loadMessageBundle()

export function getMdeSsmEnv(
    region: string,
    endpoint: string,
    ssmPath: string,
    session: mde.MdeSession
): NodeJS.ProcessEnv {
    return Object.assign(
        {
            AWS_REGION: region,
            AWS_SSM_CLI: ssmPath,
            AWS_MDE_ENDPOINT: endpoint,
            AWS_MDE_SESSION: session.id,
            AWS_MDE_STREAMURL: session.accessDetails.streamUrl,
            AWS_MDE_TOKEN: session.accessDetails.tokenValue,
        },
        process.env
    )
}

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
    const TIMEOUT_LENGTH = 600000

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

            return resp?.status === 'RUNNING' ? resp : undefined
        },
        { interval: 1500, timeout: TIMEOUT_LENGTH, truthy: true }
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

    function showMissingToolMsg(s: string) {
        const m = localize(
            'AWS.mde.missingRequiredTool',
            'Failed to connect to MDE environment, missing required tool: {0}',
            s
        )
        showViewLogsMessage(m, window)
    }

    const vsc = await SystemUtilities.getVscodeCliPath()
    if (!vsc) {
        showMissingToolMsg('code')
        return
    }

    const hasSshConfig = await mdeModel.ensureMdeSshConfig()
    if (!hasSshConfig.ok) {
        showMissingToolMsg('ssh')
        return
    }

    const mdeClient = await mde.MdeClient.create(region, mde.mdeEndpoint())
    const session = await mdeClient.startSession(args, window)
    if (!session) {
        return
    }

    const ssmPath = await mdeModel.ensureSsmCli()
    if (!ssmPath.ok) {
        return
    }

    const cmd = new ChildProcess(
        true,
        vsc,
        {
            env: getMdeSsmEnv(region, mde.mdeEndpoint(), ssmPath.result, session),
        },
        '--folder-uri',
        // TODO: save user's previous project and try to re-open
        `vscode-remote://ssh-remote+aws-mde-${args.id}/projects`
    )

    const settings = new DefaultSettingsConfiguration()
    settings.ensureToolkitInVscodeRemoteSsh()

    // Note: `await` is intentionally not used.
    cmd.run(
        (stdout: string) => {
            getLogger().verbose(`MDE connect: ${args.id}: ${stdout}`)
        },
        (stderr: string) => {
            getLogger().verbose(`MDE connect: ${args.id}: ${stderr}`)
        }
    ).then(o => {
        if (o.exitCode !== 0) {
            getLogger().error('MDE connect: failed to start: %O', cmd)
        }
    })
}

export async function mdeCreateCommand(
    node?: MdeRootNode,
    // this is just partial for now for testing
    // it should instead be pass-through to the create API
    options?: Partial<CreateEnvironmentRequest> & { repo?: { url: string; branch?: string } },
    ctx?: ExtContext,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<mde.MdeEnvironment | undefined> {
    const mdeClient = ext.mde
    const d = new Date()
    const dateYear = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(d)
    const dateMonth = new Intl.DateTimeFormat('en', { month: '2-digit' }).format(d)
    const dateDay = new Intl.DateTimeFormat('en', { day: '2-digit' }).format(d)
    const dateStr = `${dateYear}-${dateMonth}-${dateDay}`

    getLogger().debug('MDE: mdeCreateCommand called on node: %O', node)
    const label = `created-${dateStr}`
    const failMsg = localize('AWS.mde.createFailed', 'Failed to create MDE environment: {0}', label)

    if (!ctx) {
        getLogger().debug('MDE: mdeCreateCommand should be called with extension context')
        return
    }

    const response = await createMdeWebview(ctx, options?.repo)
    if (!response) {
        getLogger().debug('MDE: user cancelled create environment webview')
        return
    }

    const repo = response?.sourceCode
    // We will always perform the clone
    delete response?.sourceCode
    // API will reject our extra data
    delete options?.repo

    try {
        const defaultTags = {
            [VSCODE_MDE_TAGS.tool]: productName,
        }
        if (repo && repo[0]) {
            defaultTags[VSCODE_MDE_TAGS.repository] = repo[0].uri
            defaultTags[VSCODE_MDE_TAGS.repositoryBranch] = repo[0].branch ?? 'master' // TODO: better fallback?
        }
        const emailHash = await mdeModel.getEmailHash()
        if (emailHash) {
            defaultTags[VSCODE_MDE_TAGS.email] = emailHash
        }
        const env = await mdeClient.createEnvironment({
            // Persistent storage in Gb (0,16,32,64), 0 = no persistence.
            // sourceCode: [{ uri: 'https://github.com/neovim/neovim.git', branch: 'master' }],
            // definition: {
            //     shellImage: `"{"\"shellImage\"": "\"mcr.microsoft.com/vscode/devcontainers/go\""}"`,
            // },
            // instanceType: ...  // TODO?
            // ideRuntimes: ...  // TODO?
            ...options,
            ...response,
            tags: {
                ...defaultTags,
                ...(response?.tags ?? {}),
            },
        })

        if (!env) {
            showViewLogsMessage(failMsg, window)
            return
        }

        getLogger().info('MDE: created environment: %O', env)

        const session = await mdeClient.startSession({ id: env.id }, window)
        if (!session) {
            return
        }

        // Clone repo to MDE
        // TODO: show notification while cloning?
        if (options?.start !== false && repo?.[0] && env?.id) {
            const mde = await startMde(env, mdeClient)
            if (!mde) {
                return
            }
            await cloneToMde(mde, session, mdeClient.regionCode, vscode.Uri.parse(repo[0].uri, true), repo[0].branch)
        }

        // TODO: MDE telemetry
        // recordEcrCreateRepository({ result: 'Succeeded' })
        return env
    } catch (e) {
        getLogger().error('MDE: failed to create %O: %O', label, e)
        showViewLogsMessage(failMsg, window)
        // TODO: MDE telemetry
        // recordEcrCreateRepository({ result: 'Failed' })
    } finally {
        if (node !== undefined) {
            node.refresh()
        } else {
            await commands.execute('aws.refreshAwsExplorer', true)
        }
    }
}

export async function mdeDeleteCommand(
    env: Pick<mde.MdeEnvironment, 'id'>,
    node?: MdeRootNode,
    commands = Commands.vscode()
): Promise<DeleteEnvironmentResponse | undefined> {
    // TODO: add suppress option
    const prompt = localize('AWS.mde.delete.confirm.message', 'Are you sure you want to delete this environment?')
    const response = await showConfirmationMessage({ prompt, confirm: localizedDelete })

    if (response) {
        const r = await ext.mde.deleteEnvironment({ environmentId: env.id })
        getLogger().info('%O', r?.status)
        if (node !== undefined) {
            node.refresh()
        } else {
            await commands.execute('aws.refreshAwsExplorer', true)
        }
        return r
    }
}

const SSH_AGENT_SOCKET_VARIABLE = 'SSH_AUTH_SOCK'

export async function cloneToMde(
    mdeEnv: mde.MdeEnvironment & { id: string },
    session: mde.MdeSession,
    region: string,
    repo: vscode.Uri,
    branch?: string
): Promise<void> {
    const agentSock = startSshAgent()
    const ssmPath = await mdeModel.ensureSsmCli()
    if (!ssmPath.ok) {
        return
    }

    // For some reason git won't accept URIs with the 'ssh' scheme?
    const target = repo.scheme === 'ssh' ? `${repo.authority}${repo.path}` : repo.toString()
    // TODO: let user name the project (if they want)
    const repoName = repo.path.split('/').pop()?.split('.')[0]

    const gitArgs = (branch ? ['-b', branch] : []).concat(`/projects/'${repoName}'`)
    const sshCommands = [
        'mkdir -p ~/.ssh',
        'mkdir -p /projects',
        'touch ~/.ssh/known_hosts',
        'ssh-keyscan github.com >> ~/.ssh/known_hosts',
        `git clone '${target}' ${gitArgs.join(' ')}`,
    ]
    const env = getMdeSsmEnv(region, mde.mdeEndpoint(), ssmPath.result, session)

    // TODO: could we parse for 'Permission denied (publickey).' and then tell user they need to add their SSH key to the agent?
    // TODO: handle different ports with the URI
    // TODO: test on windows?
    // TODO: handle failures
    await new ChildProcess(
        true,
        `ssh`,
        { env: Object.assign({ [SSH_AGENT_SOCKET_VARIABLE]: agentSock }, env) },
        `aws-mde-${mdeEnv.id}`,
        '-o',
        'StrictHostKeyChecking=no',
        'AddKeysToAgent=yes',
        sshCommands.join(' && ')
    ).run(
        (stdout: string) => {
            getLogger().verbose(`MDE clone: ${mdeEnv.id}: ${stdout}`)
        },
        (stderr: string) => {
            getLogger().verbose(`MDE clone: ${mdeEnv.id}: ${stderr}`)
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

export async function resumeEnvironments(ctx: ExtContext) {
    const memento = ctx.extensionContext.globalState
    const pendingRestarts = memento.get<Record<string, boolean>>(MDE_RESTART_KEY, {})

    // filter out stale environments
    // TODO: write some utility code for mementos
    const activeEnvironments: mde.MdeEnvironment[] = []
    const ids = new Set<string>()
    for await (const env of ext.mde.listEnvironments({})) {
        env && activeEnvironments.push(env) && ids.add(env.id)
    }
    Object.keys(pendingRestarts).forEach(k => {
        if (!ids.has(k) || !pendingRestarts[k]) {
            delete pendingRestarts[k]
        }
    })
    memento.update(MDE_RESTART_KEY, pendingRestarts)

    getLogger().debug('MDEs waiting to be resumed: %O', pendingRestarts)

    // TODO: if multiple MDEs are in a 'restart' state, prompt user
    const target = Object.keys(pendingRestarts).pop()
    const env = activeEnvironments.find(env => env.id === target)
    if (env) {
        const region = awsArn.parse(env.arn).region
        mdeConnectCommand(env, region).then(() => {
            // TODO: we can mark this environment as 'attemptedRestart'
            // should be left up to the target environment to remove itself from the
            // pending restart global state
        })
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

export async function tagMde(arn: string, tagMap: TagMap) {
    await ext.mde.tagResource(arn, tagMap)
}
