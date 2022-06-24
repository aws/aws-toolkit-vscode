/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as awsArn from '@aws-sdk/util-arn-parser'
import * as mde from '../shared/clients/mdeClient'
import * as nls from 'vscode-nls'
import * as path from 'path'
import { getLogger } from '../shared/logger/logger'
import { ChildProcess } from '../shared/utilities/childProcess'
import { showConfirmationMessage, showMessageWithCancel, showViewLogsMessage } from '../shared/utilities/messages'
import { Commands } from '../shared/vscode/commands'
import { Window } from '../shared/vscode/window'
import { MdeRootNode } from './mdeRootNode'
import { Timeout, waitTimeout, waitUntil } from '../shared/utilities/timeoutUtils'
import { ExtContext } from '../shared/extensions'
import { DeleteEnvironmentResponse, TagMap } from '../../types/clientmde'
import { SystemUtilities } from '../shared/systemUtilities'
import * as mdeModel from './mdeModel'
import { localizedDelete } from '../shared/localizedText'
import { HOST_NAME_PREFIX, MDE_RESTART_KEY } from './constants'
import { parse } from '@aws-sdk/util-arn-parser'
import { RemoteEnvironmentClient } from '../shared/clients/mdeEnvironmentClient'
import { checkUnsavedChanges } from '../shared/utilities/workspaceUtils'
import { getMdeEnvArn } from '../shared/vscode/env'
import { SSH_AGENT_SOCKET_VARIABLE, startSshAgent } from '../shared/extensions/ssh'

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
    mdeClient: mde.MdeClient,
    node?: MdeRootNode
): Promise<mde.MdeEnvironment | undefined> {
    // hard-coded timeout for now
    const TIMEOUT_LENGTH = 600000

    const timeout = new Timeout(TIMEOUT_LENGTH)
    const progress = await showMessageWithCancel(localize('AWS.mde.startMde.message', 'MDE'), timeout)
    progress.report({ message: localize('AWS.mde.startMde.checking', 'checking status...') })

    if (node) {
        node.startPolling()
    }

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
        { interval: 10000, timeout: TIMEOUT_LENGTH, truthy: true }
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

export async function mdeConnectCommand(args: Pick<mde.MdeEnvironment, 'id'>, region: string): Promise<void> {
    const mdeClient = await mde.MdeClient.create(region, mde.mdeEndpoint())

    const deps = await mdeModel.ensureDependencies()
    if (!deps) {
        return
    }

    const envProvider = mdeModel.createMdeEnvProvider(mdeClient, deps.ssm, args)
    const SessionProcess = mdeModel.createBoundProcess(envProvider).extend({
        onStdout(stdout) {
            getLogger().verbose(`MDE connect: ${args.id}: ${stdout}`)
        },
        onStderr(stderr) {
            getLogger().verbose(`MDE connect: ${args.id}: ${stderr}`)
        },
        rejectOnErrorCode: true,
    })

    await mdeModel.startVscodeRemote(SessionProcess, `${HOST_NAME_PREFIX}${args.id}`, '/projects', deps.vsc)
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
        if (node) {
            node.startPolling()
        }
        const client = await mde.MdeClient.create()
        const r = await client.deleteEnvironment({ environmentId: env.id })
        getLogger().info('%O', r?.status)
        if (node) {
            node.refresh()
        } else {
            await commands.execute('aws.refreshAwsExplorer', true)
        }
        return r
    }
}

export async function cloneToMde(
    mdeEnv: mde.MdeEnvironment,
    repo: { uri: vscode.Uri; branch?: string },
    projectDir: string = '/projects'
): Promise<void> {
    getLogger().debug(`MDE: cloning ${repo.uri} to ${mdeEnv.id}`)

    // For some reason git won't accept URIs with the 'ssh' scheme?
    const target = repo.uri.scheme === 'ssh' ? `${repo.uri.authority}${repo.uri.path}` : repo.uri.toString()
    // TODO: let user name the project (if they want)
    const repoName = repo.uri.path.split('/').pop()?.split('.')[0]

    const gitArgs = (repo.branch ? ['-b', repo.branch] : []).concat(`${projectDir}/'${repoName}'`)
    const commands = [
        'mkdir -p ~/.ssh',
        `mkdir -p ${projectDir}`, // Try to create the directory, though we might not have permissions
        'touch ~/.ssh/known_hosts',
        'ssh-keyscan github.com >> ~/.ssh/known_hosts',
        `git clone '${target}' ${gitArgs.join(' ')}`,
    ]

    const process = await createMdeSshCommand(mdeEnv, commands, { useAgent: repo.uri.scheme === 'ssh' })
    // TODO: handle different ports with the URI

    const result = await process.run({
        onStdout(stdout) {
            getLogger().verbose(`MDE clone: ${mdeEnv.id}: ${stdout}`)
        },
        onStderr(stderr) {
            getLogger().verbose(`MDE clone: ${mdeEnv.id}: ${stderr}`)
        },
    })

    if (result.exitCode !== 0) {
        throw new Error('Failed to clone repository')
    }
}

interface MdeSshCommandOptions {
    /** Uses this session to inject environment variables, otherwise creates a new one. */
    session?: mde.MdeSession
    /** Whether or not to forward an SSH agent. This will attempt to start the agent if not already running. (default: false) */
    useAgent?: boolean
}

// TODO: use this for connect as well
/**
 * Creates a new base ChildProcess with configured SSH arguments.
 * The SSH agent socket will be added as an environment variable if applicable.
 */
export async function createMdeSshCommand(
    mdeEnv: Pick<mde.MdeEnvironment, 'id' | 'arn'>,
    commands: string[],
    options: MdeSshCommandOptions = {}
): Promise<ChildProcess> {
    const useAgent = options.useAgent ?? false
    const agentSock = useAgent ? await startSshAgent() : undefined
    const ssmPath = await mdeModel.ensureSsmCli()

    if (!ssmPath.ok) {
        throw new Error('Unable to create MDE SSH command: SSM Plugin not found')
    }

    const region = parse(mdeEnv.arn).region
    const mdeClient = await mde.MdeClient.create(region, mde.mdeEndpoint())
    const session = options.session ?? (await mdeClient.startSession(mdeEnv))

    // TODO: check SSH version to verify 'accept-new' is available
    const mdeEnvVars = mdeModel.getMdeSsmEnv(region, ssmPath.result, session)
    const env = { [SSH_AGENT_SOCKET_VARIABLE]: agentSock, ...mdeEnvVars }

    const sshPath = await SystemUtilities.findSshPath()
    if (!sshPath) {
        throw new Error('Unable to create MDE SSH command: could not find ssh executable')
    }

    const sshArgs = [
        `${HOST_NAME_PREFIX}${mdeEnv.id}`,
        `${useAgent ? '-A' : ''}`,
        '-o',
        'StrictHostKeyChecking=accept-new',
        'AddKeysToAgent=yes',
        commands.join(' && '),
    ].filter(c => !!c)

    return new ChildProcess(sshPath, sshArgs, { spawnOptions: { env } })
}

export async function resumeEnvironments(ctx: ExtContext) {
    const memento = ctx.extensionContext.globalState
    const pendingRestarts = memento.get<Record<string, boolean>>(MDE_RESTART_KEY, {})

    // filter out stale environments
    // TODO: write some utility code for mementos
    const activeEnvironments: mde.MdeEnvironment[] = []
    const ids = new Set<string>()
    const client = await mde.MdeClient.create()
    for await (const env of client.listEnvironments({})) {
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

export async function tagMde(arn: string, tagMap: TagMap) {
    const client = await mde.MdeClient.create()
    await client.tagResource(arn, tagMap)
}

/**
 * Tries to restart an environment, prompting the user if any unsaved documents (excluding webviews) are
 * opened when restarting the current environment.
 *
 * This function basically acts like a transactional wrapper around the `restarter` callback
 */
export async function tryRestart(arn: string, restarter: () => Promise<void>): Promise<void> {
    const client = new RemoteEnvironmentClient()
    const canAutoConnect = client.arn === arn

    if (canAutoConnect && checkUnsavedChanges()) {
        // TODO: show confirmation prompt instead
        vscode.window.showErrorMessage('Cannot stop current environment with unsaved changes')
        throw new Error('Cannot stop environment with unsaved changes')
    }

    try {
        await restarter()

        // TODO: find way to open local workspace from remote window (or even better, open no workspace)
        /*
        const state = memento.get(arn)
        if (state.localSessionHome) {
            const home = vscode.Uri.parse(`vscode://folder/${state.localSessionHome}`)
            vscode.commands.executeCommand('vscode.openFolder', home)
        }
        */
    } catch (err) {
        // This is stubbed out until we fully implement a 'resume' workflow
        //await memento.with(arn, { previousRemoteWorkspace: undefined, pendingResume: false, canAutoConnect: false })
        if (!(err instanceof Error)) {
            throw new TypeError(`Received unknown error: ${JSON.stringify(err ?? 'null')}`)
        }

        getLogger().error('Failed to restart environment: %O', err)
        showViewLogsMessage(`Failed to restart environment: ${err.message}`)
    }
}

export const UPDATE_DEVFILE_COMMAND = ['aws.mde.updateDevfile', updateDevfile] as const
export async function updateDevfile(uri: vscode.Uri): Promise<void> {
    const arn = getMdeEnvArn()
    if (!arn) {
        return void getLogger().debug(`mde: not current in a environment`)
    }

    const client = new RemoteEnvironmentClient()
    // XXX: hard-coded `projects` path, waiting for MDE to provide an environment variable
    // could also just parse the devfile...
    const location = path.relative('/projects', uri.fsPath)

    const title = localize('AWS.mde.container.restart', 'Restarting container...')
    await vscode.window.withProgress({ title, location: vscode.ProgressLocation.Notification }, () =>
        tryRestart(arn, () => client.startDevfile({ location }))
    )
    // if we get here, no restart happened :(
}
