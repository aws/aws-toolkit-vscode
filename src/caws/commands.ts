/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CawsClient, CawsDevEnv, cawsRegion, ConnectedCawsClient, CawsResource } from '../shared/clients/cawsClient'
import globals from '../shared/extensionGlobals'
import { showViewLogsMessage } from '../shared/utilities/messages'
import { LoginWizard } from './wizards/login'
import { selectCawsResource } from './wizards/selectResource'
import * as nls from 'vscode-nls'
import { getLogger } from '../shared/logger'
import * as mdeModel from '../mde/mdeModel'
import { openCawsUrl } from './utils'
import { CawsAuthenticationProvider } from './auth'

const localize = nls.loadMessageBundle()

type LoginResult = 'Succeeded' | 'Cancelled' | 'Failed'

export async function login(authProvider: CawsAuthenticationProvider, client: CawsClient): Promise<LoginResult> {
    // TODO: add telemetry
    const wizard = new LoginWizard(authProvider)
    const lastSession = authProvider.listSessions()[0]
    const response = await wizard.run()

    if (!response) {
        return 'Cancelled'
    }

    try {
        const { accountDetails, accessDetails } = response.session
        client.setCredentials(accountDetails.label, accessDetails)

        if (lastSession) {
            authProvider.deleteSession(lastSession)
        }

        return 'Succeeded'
    } catch (err) {
        return 'Failed'
    }
}

export async function autoConnect(authProvider: CawsAuthenticationProvider): Promise<boolean> {
    for (const account of authProvider.listAccounts()) {
        getLogger().info(`CAWS: trying to auto-connect with user: ${account.label}`)

        try {
            await authProvider.createSession(account)
            getLogger().info(`CAWS: auto-connected with user: ${account.label}`)

            return true
        } catch (err) {}
    }

    return false
}

export async function logout(authProvider: CawsAuthenticationProvider): Promise<void> {
    const session = authProvider.listSessions()[0]

    if (session) {
        return authProvider.deleteSession(session)
    }
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
            const result = await login(CawsAuthenticationProvider.getInstance(), client)

            if (result === 'Succeeded' && client.connected) {
                return command(client, ...args)
            }

            if (result === 'Failed') {
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
        const r = await selectCawsResource(client, 'repo')
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
    const repo = await selectCawsResource(client, 'repo')
    const projectName = repo?.project.name
    const organizationName = repo?.org.name

    if (!projectName || !organizationName) {
        return
    }

    const args = {
        organizationName,
        projectName,
        ideRuntimes: ['VSCode'],
        repositories: [
            {
                projectName,
                repositoryName: repo.name,
                branchName: repo.defaultBranch,
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
                projectName,
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
export async function openCawsResource(client: ConnectedCawsClient, kind: CawsResource['type']): Promise<void> {
    // TODO: add telemetry
    const resource = await selectCawsResource(client, kind)

    if (!resource) {
        return
    }

    if (resource.type !== 'env') {
        openCawsUrl(resource)
        return
    }

    try {
        await openDevEnv(client, resource)
    } catch (err) {
        showViewLogsMessage(
            localize(
                'AWS.command.caws.createDevEnv.failed',
                'Failed to start CODE.AWS development environment "{0}": {1}',
                resource.developmentWorkspaceId,
                (err as Error).message
            )
        )
    }
}
