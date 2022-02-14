/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CawsClient, CawsDevEnv, CawsRepo, cawsRegion } from '../shared/clients/cawsClient'
import globals, { checkCaws } from '../shared/extensionGlobals'
import { ExtContext } from '../shared/extensions'
import { showViewLogsMessage } from '../shared/utilities/messages'
import { LoginWizard } from './wizards/login'
import { selectCawsResource } from './wizards/selectResource'
import * as nls from 'vscode-nls'
import { getLogger } from '../shared/logger'
import * as mdeModel from '../mde/mdeModel'

const localize = nls.loadMessageBundle()

export async function login(context: ExtContext, client: CawsClient): Promise<void> {
    // TODO: add telemetry
    const ctx = context.extensionContext
    const wizard = new LoginWizard(ctx)
    const response = await wizard.run()

    if (!response) {
        return // cancelled
    }

    await client.onCredentialsChanged(undefined, response.user.cookie)
    const sess = await client.verifySession()

    if (!sess?.identity) {
        showViewLogsMessage('CODE.AWS: failed to connect')
        return
    }

    if (response?.user.newUser) {
        ctx.secrets.store(`caws/${client.user()}`, response.user.cookie)
    }

    context.awsContext.setCawsCredentials(client.user(), response.user.cookie)
}

export async function logout(context: ExtContext, client: CawsClient): Promise<void> {
    // TODO: add telemetry
    if (!context.awsContext.getCawsCredentials()) {
        return
    }
    await client.onCredentialsChanged(undefined, undefined)
    context.awsContext.setCawsCredentials('', '')
}

/** "List CODE.AWS Commands" command. */
export async function listCommands(): Promise<void> {
    // TODO: add telemetry
    vscode.commands.executeCommand('workbench.action.quickOpen', '> CODE.AWS')
}

/** "Clone CODE.AWS Repository" command. */
export async function cloneCawsRepo(): Promise<void> {
    // TODO: add telemetry
    if (!checkCaws()) {
        return
    }
    const c = globals.caws
    const r = (await selectCawsResource('repo')) as CawsRepo
    if (!r) {
        return
    }
    const cloneLink = await c.toCawsGitUri(r)
    vscode.commands.executeCommand('git.clone', cloneLink)
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
        c.openCawsUrl(o)
        return
    }

    const env = o as CawsDevEnv
    try {
        const runningEnv = await c.startEnvironmentWithProgress(
            {
                developmentWorkspaceId: env.developmentWorkspaceId,
                organizationName: env.org.name,
                projectName: env.project.name,
            },
            ''
        )
        if (!runningEnv) {
            getLogger().error('openCawsResource: failed to start environment: %s', env.developmentWorkspaceId)
            return
        }
        mdeModel.connectToMde(
            {
                id: env.developmentWorkspaceId,
            },
            cawsRegion,
            async () => {
                const session = await c.startDevEnvSession({
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

        // if (request.devfile) {
        //     await c.waitForDevfile(runningEnv)
        //     // XXX: most devfiles specify mounting the 'project' directory, not 'projects'
        //     await cloneToMde(runningEnv, { ...repo, uri: repoUri }, '/project')
        // } else {
        //     await cloneToMde(runningEnv, { ...repo, uri: repoUri })
        // }
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
