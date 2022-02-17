/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import { CawsClient, CawsDevEnv, CawsRepo, cawsRegion, CawsProject, CawsOrg } from '../shared/clients/cawsClient'
import globals, { checkCaws } from '../shared/extensionGlobals'
import { ExtContext } from '../shared/extensions'
import { showViewLogsMessage } from '../shared/utilities/messages'
import { LoginWizard } from './wizards/login'
import { selectCawsResource } from './wizards/selectResource'
import * as nls from 'vscode-nls'
import { getLogger } from '../shared/logger'
import * as mdeModel from '../mde/mdeModel'

const localize = nls.loadMessageBundle()

export async function login(ctx: vscode.ExtensionContext, awsCtx: AwsContext, client: CawsClient): Promise<boolean> {
    // TODO: add telemetry
    const wizard = new LoginWizard(ctx)
    const response = await wizard.run()

    if (!response) {
        return false
    }

    await client.onCredentialsChanged(undefined, response.user.cookie)
    const sess = await client.verifySession()

    if (!sess?.identity) {
        showViewLogsMessage('CODE.AWS: failed to connect')
        return false
    }

    if (response?.user.newUser) {
        ctx.secrets.store(`caws/${client.user()}`, response.user.cookie)
    }

    awsCtx.setCawsCredentials(client.user(), response.user.cookie)
    return true
}

export async function logout(ctx: ExtContext, client: CawsClient): Promise<void> {
    // TODO: add telemetry
    if (!ctx.awsContext.getCawsCredentials()) {
        return
    }
    await client.onCredentialsChanged(undefined, undefined)
    ctx.awsContext.setCawsCredentials('', '')
}

/** "List CODE.AWS Commands" command. */
export async function listCommands(): Promise<void> {
    // TODO: add telemetry
    vscode.commands.executeCommand('workbench.action.quickOpen', '> CODE.AWS')
}

/** "Clone CODE.AWS Repository" command. */
export async function cloneCawsRepo(url?: vscode.Uri): Promise<void> {
    // TODO: add telemetry
    // We need better encapsulation of a CAWS session to propagate through commands
    // The session should live at the top and injected as context
    if (!globals.caws.connected() && !(await login(globals.context, globals.awsContext, globals.caws))) {
        return
    }
    const c = globals.caws

    if (!url) {
        const r = (await selectCawsResource('repo')) as CawsRepo
        if (!r) {
            return
        }
        const cloneLink = await c.toCawsGitUri(r.org.name, r.project.name, r.name)
        await vscode.commands.executeCommand('git.clone', cloneLink)
    } else {
        const [_, org, repo, project] = url.path.slice(1).split('/')
        if (!project) {
            throw new Error(`CAWS URL is invalid, project was undefined: ${url.path}`)
        }

        await vscode.commands.executeCommand('git.clone', await c.toCawsGitUri(org, repo, project))
    }
}

/** "Create CODE.AWS Development Environment" (MDE) command. */
export async function createDevEnv(): Promise<void> {
    // TODO: add telemetry
    if (!checkCaws()) {
        return
    }
    const c = globals.caws
    const r = (await selectCawsResource('repo')) as CawsRepo
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
    const env = await c.createDevEnv(args)
    try {
        await c.startEnvironmentWithProgress(
            {
                developmentWorkspaceId: env.developmentWorkspaceId,
                ...args,
            },
            ''
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

export async function openDevEnv(client: CawsClient, env: CawsDevEnv): Promise<void> {
    const runningEnv = await client.startEnvironmentWithProgress(
        {
            developmentWorkspaceId: env.developmentWorkspaceId,
            organizationName: env.org.name,
            projectName: env.project.name,
        },
        ''
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
export async function openCawsResource(kind: 'org' | 'project' | 'repo' | 'env'): Promise<void> {
    // TODO: add telemetry
    if (!checkCaws()) {
        return
    }
    const c = globals.caws
    const o = await selectCawsResource(kind)
    if (!o) {
        return
    }
    if (kind !== 'env') {
        c.openCawsUrl(o as CawsRepo | CawsProject | CawsOrg)
        return
    }

    const env = o as CawsDevEnv
    try {
        await openDevEnv(c, env)
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
