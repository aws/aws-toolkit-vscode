/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import {
    CawsClient,
    CawsDevEnv,
    CawsRepo,
    cawsRegion,
    CawsProject,
    CawsOrg,
    ConnectedCawsClient,
} from '../shared/clients/cawsClient'
import globals from '../shared/extensionGlobals'
import { ExtContext } from '../shared/extensions'
import { showViewLogsMessage } from '../shared/utilities/messages'
import { LoginWizard } from './wizards/login'
import { selectCawsResource } from './wizards/selectResource'
import * as nls from 'vscode-nls'
import { getLogger } from '../shared/logger'
import * as mdeModel from '../mde/mdeModel'
import { getSavedCookies, openCawsUrl } from './utils'

const localize = nls.loadMessageBundle()

type LoginResult = 'succeeded' | 'cancelled' | 'failed'

async function tryLogin(awsCtx: AwsContext, client: CawsClient, cookie: string): Promise<boolean> {
    await client.setCredentials('', cookie)
    await client.verifySession().catch() // Client is already logging...

    if (client.connected) {
        awsCtx.setCawsCredentials(client.user(), cookie)

        return true
    }

    return false
}

export async function login(
    ctx: vscode.ExtensionContext,
    awsCtx: AwsContext,
    client: CawsClient
): Promise<LoginResult> {
    // TODO: add telemetry
    const wizard = new LoginWizard(ctx)
    const response = await wizard.run()

    if (!response) {
        return 'cancelled'
    }

    if (await tryLogin(awsCtx, client, response.user.cookie)) {
        if (response?.user.newUser && client.connected) {
            ctx.secrets.store(`caws/${client.user()}`, response.user.cookie)
        }

        return 'succeeded'
    }

    return 'failed'
}

export async function autoConnect(
    ctx: vscode.ExtensionContext,
    awsCtx: AwsContext,
    client: CawsClient
): Promise<boolean> {
    for (const session of await getSavedCookies(ctx.globalState, ctx.secrets)) {
        getLogger().info(`CAWS: trying to auto-connect with user: ${session.name}`)

        if (await tryLogin(awsCtx, client, session.cookie)) {
            getLogger().info(`CAWS: auto-connected with user: ${session.name}`)

            return true
        }
    }

    return false
}

export async function logout(ctx: ExtContext): Promise<void> {
    // TODO: add telemetry
    if (!ctx.awsContext.getCawsCredentials()) {
        return
    }
    ctx.awsContext.setCawsCredentials('', '')
}

/** "List CODE.AWS Commands" command. */
export async function listCommands(): Promise<void> {
    // TODO: add telemetry
    vscode.commands.executeCommand('workbench.action.quickOpen', '> CODE.AWS')
}

/**
 * Decorates a command, attempting to login prior to execution
 *
 * Can be used to inject context/dependencies later
 */
export function tryCommand<T, U>(
    clientFactory: () => Promise<CawsClient>,
    command: (client: ConnectedCawsClient, ...args: T[]) => U | Promise<U>
): (...args: T[]) => Promise<U | undefined> {
    return async (...args: T[]) => {
        const client = await clientFactory()

        if (!client.connected) {
            const result = await login(globals.context, globals.awsContext, client)

            if (result === 'succeeded' && client.connected) {
                return command(client, ...args)
            }

            if (result === 'failed') {
                globals.window.showErrorMessage('AWS: Not connected to CODE.AWS')
            }

            return
        }

        return command(client, ...args)
    }
}

/** "Clone CODE.AWS Repository" command. */
export async function cloneCawsRepo(client: ConnectedCawsClient, url?: vscode.Uri): Promise<void> {
    // TODO: add telemetry
    if (!url) {
        const r = (await selectCawsResource(client, 'repo')) as CawsRepo
        if (!r) {
            return
        }
        const cloneLink = await client.toCawsGitUri(r.org.name, r.project.name, r.name)
        await vscode.commands.executeCommand('git.clone', cloneLink)
    } else {
        const [_, org, repo, project] = url.path.slice(1).split('/')
        if (!project) {
            throw new Error(`CAWS URL is invalid, project was undefined: ${url.path}`)
        }

        await vscode.commands.executeCommand('git.clone', await client.toCawsGitUri(org, repo, project))
    }
}

/** "Create CODE.AWS Development Environment" (MDE) command. */
export async function createDevEnv(client: ConnectedCawsClient): Promise<void> {
    // TODO: add telemetry
    const r = (await selectCawsResource(client, 'repo')) as CawsRepo
    const p = r.project
    if (!r?.name || !p?.name) {
        return
    }
    const args = {
        organizationName: p.org.name ?? '?',
        projectName: p.name ?? '?',
        ideRuntimes: ['VSCode'],
        repositories: [
            {
                branchName: r.defaultBranch,
                projectName: p.name,
                repositoryName: r.name,
            },
        ],
    }
    const env = await client.createDevEnv(args)
    try {
        await client.startEnvironmentWithProgress(
            {
                developmentWorkspaceId: env.developmentWorkspaceId,
                ...args,
            },
            'RUNNING'
        )
    } catch (err) {
        showViewLogsMessage(
            localize(
                'AWS.command.caws.createDevEnv.failed',
                'Failed to create CODE.AWS development environment in "{0}": {1}',
                p.name,
                (err as Error).message
            )
        )
    }
}

export async function openDevEnv(client: ConnectedCawsClient, env: CawsDevEnv): Promise<void> {
    const runningEnv = await client.startEnvironmentWithProgress(
        {
            developmentWorkspaceId: env.developmentWorkspaceId,
            organizationName: env.org.name,
            projectName: env.project.name,
        },
        'RUNNING'
    )
    if (!runningEnv) {
        getLogger().error('openDevEnv: failed to start environment: %s', env.developmentWorkspaceId)
        return
    }

    await mdeModel.connectToMde(
        {
            id: env.developmentWorkspaceId,
        },
        cawsRegion,
        async () => {
            const session = await client.startDevEnvSession({
                projectName: env.project.name,
                organizationName: env.org.name,
                developmentWorkspaceId: env.developmentWorkspaceId,
            })
            if (!session?.sessionId) {
                return undefined
            }
            return {
                ...session,
                id: session.sessionId,
                startedAt: new Date(),
                status: 'CONNECTED',
            }
        }
    )
}

/**
 * Implements commands:
 * - "Open CODE.AWS Organization"
 * - "Open CODE.AWS Project"
 * - "Open CODE.AWS Repository"
 */
export async function openCawsResource(
    client: ConnectedCawsClient,
    kind: 'org' | 'project' | 'repo' | 'env'
): Promise<void> {
    // TODO: add telemetry
    const o = await selectCawsResource(client, kind)
    if (!o) {
        return
    }
    if (kind !== 'env') {
        openCawsUrl(o as CawsRepo | CawsProject | CawsOrg)
        return
    }

    const env = o as CawsDevEnv
    try {
        await openDevEnv(client, env)
    } catch (err) {
        showViewLogsMessage(
            localize(
                'AWS.command.caws.createDevEnv.failed',
                'Failed to start CODE.AWS development environment "{0}": {1}',
                env.developmentWorkspaceId,
                (err as Error).message
            )
        )
    }
}
