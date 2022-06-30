/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import * as vscode from 'vscode'
import { ConnectedCawsClient, DevelopmentWorkspace } from '../shared/clients/cawsClient'
import { ExtContext } from '../shared/extensions'
import { getLogger } from '../shared/logger'
import { sleep } from '../shared/utilities/timeoutUtils'
import { WorkspaceSettings } from './commands'
import { CAWS_RECONNECT_KEY, createClientFactory, DevEnvId, EnvironmentMemento, openDevEnv } from './model'
import { showViewLogsMessage } from '../shared/utilities/messages'
import { CawsAuthenticationProvider } from './auth'
import { getCawsWorkspaceArn } from '../shared/vscode/env'
import globals from '../shared/extensionGlobals'

const localize = nls.loadMessageBundle()

const RECONNECT_TIMER = 5000
const MAX_RECONNECT_TIME = 10 * 60 * 1000

export function watchRestartingWorkspaces(ctx: ExtContext, authProvider: CawsAuthenticationProvider) {
    let restartHandled = false
    authProvider.onDidChangeSessions(async () => {
        if (restartHandled) {
            return
        }

        const client = await createClientFactory(authProvider)()
        if (client.connected) {
            const arn = getCawsWorkspaceArn()
            handleRestart(client, ctx, arn)
            restartHandled = true
        }
    })
}

function handleRestart(client: ConnectedCawsClient, ctx: ExtContext, cawsArn: string | undefined) {
    if (cawsArn !== undefined) {
        const memento = ctx.extensionContext.globalState
        const pendingReconnects = memento.get<Record<string, EnvironmentMemento>>(CAWS_RECONNECT_KEY, {})
        const workspaceId = cawsArn.split('/').pop() ?? ''
        if (workspaceId && workspaceId in pendingReconnects) {
            const environment = pendingReconnects[workspaceId]
            const workspaceName = getWorkspaceName(environment.alias, workspaceId)
            getLogger().info(`caws: ssh session to ${workspaceName} has reconnected successfully`)
            vscode.window.showInformationMessage(
                localize('AWS.caws.reconnect.success', 'Successfully reconnected to: {0}', workspaceName)
            )
            delete pendingReconnects[workspaceId]
            memento.update(CAWS_RECONNECT_KEY, pendingReconnects)
        }
    } else {
        getLogger().info('caws: attempting to poll development workspaces')

        // Reconnect environments (if coming from a restart)
        reconnectEnvironments(client, ctx).catch(err => {
            getLogger().error(`caws: error while resuming environments: ${err}`)
        })
    }
}

/**
 * Attempt to poll for connection in all valid environments
 * @param client a connected caws client
 * @param ctx the extension context
 */
async function reconnectEnvironments(client: ConnectedCawsClient, ctx: ExtContext): Promise<void> {
    const memento = ctx.extensionContext.globalState
    const pendingEnvironments = memento.get<Record<string, EnvironmentMemento>>(CAWS_RECONNECT_KEY, {})
    const validEnvironments = filterInvalidEnvironments(pendingEnvironments)
    if (Object.keys(validEnvironments).length === 0) {
        return
    }

    const workspaceNames = []
    for (const [id, environment] of Object.entries(validEnvironments)) {
        workspaceNames.push(getWorkspaceName(environment.alias, id))
    }

    const polledWorkspaces = workspaceNames.join(', ')
    const progressTitle = localize(
        'AWS.caws.reconnect.restarting',
        'The following workspaces are restarting: {0}',
        polledWorkspaces
    )
    vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
        },
        (progress, token) => {
            progress.report({ message: progressTitle })
            return pollWorkspaces(client, progress, token, memento, validEnvironments)
        }
    )
}

/**
 * Filter out environments who are expired OR are already attempting to reconnect.
 * @param environments All of the possible in environments to check
 */
function filterInvalidEnvironments(environments: Record<string, EnvironmentMemento>) {
    for (const reconnectWorkspaceId in environments) {
        const workspaceDetail = environments[reconnectWorkspaceId]
        if (isExpired(workspaceDetail.previousConnectionTimestamp) || workspaceDetail.attemptingReconnect) {
            delete environments[reconnectWorkspaceId]
        }
    }
    return environments
}

/**
 * Ensure that all environments that are currently being looked at set to attempting to reconnect so that they are not looked at
 * by any other instance of VSCode.
 * @param memento
 * @param environments
 */
function setWatchedEnvironmentStatus(
    memento: vscode.Memento,
    environments: Record<string, EnvironmentMemento>,
    watchStatus: boolean
) {
    for (const [id, detail] of Object.entries(environments)) {
        environments[id] = { ...detail, attemptingReconnect: watchStatus }
    }
    return memento.update(CAWS_RECONNECT_KEY, environments)
}

/**
 * Continuously poll all the workspaces until they are either:
 *      1. Available for re-opening, in which case re-open them automatically
 *      2. In a terminating state or expired, in which case no longer watch the workspace
 *      3. Failed to start, in which case notify the user
 * @param client A connected caws client
 * @param memento vscode global storage library
 * @param workspaces All VALID workspaces that are not being watched by any other VSCode instance
 */
async function pollWorkspaces(
    client: ConnectedCawsClient,
    progress: vscode.Progress<{ message: string }>,
    token: vscode.CancellationToken,
    memento: vscode.Memento,
    workspaces: Record<string, EnvironmentMemento>
) {
    // Ensure that all environments that you want to look at are attempting reconnection
    // and won't be watched by any other VSCode instance
    await setWatchedEnvironmentStatus(memento, workspaces, true)

    const shouldCloseRootInstance = Object.keys(workspaces).length === 1

    while (Object.keys(workspaces).length > 0) {
        if (token.isCancellationRequested) {
            await setWatchedEnvironmentStatus(memento, workspaces, false)
            return
        }

        for (const id in workspaces) {
            const details = workspaces[id]

            const workspaceName = getWorkspaceName(details.alias, id)

            try {
                const metadata = await client.getDevelopmentWorkspace({
                    id: id,
                    organizationName: details.organizationName,
                    projectName: details.projectName,
                })

                if (metadata?.status === 'RUNNING') {
                    progress.report({
                        message: `Workspace ${workspaceName} is now running. Attempting to re-open`,
                    })

                    openReconnectedWorkspace(client, id, details, shouldCloseRootInstance)

                    // We no longer need to watch this workspace anymore because it's already being re-opened in SSH
                    delete workspaces[id]
                } else if (isTerminating(metadata)) {
                    progress.report({ message: `Workspace ${workspaceName} is terminating` })
                    // We no longer need to watch a workspace that is in a terminating state
                    delete workspaces[id]
                } else if (isExpired(details.previousConnectionTimestamp)) {
                    progress.report({ message: `Workspace ${workspaceName} has expired` })
                }
            } catch {
                await failWorkspace(memento, id)
                delete workspaces[id]
                showViewLogsMessage(localize('AWS.caws.reconnect', 'Unable to reconnect to ${0}', workspaceName))
            }
        }
        await sleep(RECONNECT_TIMER)
    }
}

function isTerminating(workspace: Pick<DevelopmentWorkspace, 'status'>): boolean {
    if (!workspace.status) {
        return false
    }

    return workspace.status === 'FAILED' || workspace.status === 'DELETING' || workspace.status === 'DELETED'
}

function isExpired(previousConnectionTime: number): boolean {
    return Date.now() - previousConnectionTime > MAX_RECONNECT_TIME
}

/**
 * When a workspace fails, remove it from the memento so we no longer watch it in the future
 * @param memento The memento instance from vscode
 * @param workspaceId the id of the workspace to fail
 * @param workspaceDetails the details of the failing workspace
 */
function failWorkspace(memento: vscode.Memento, workspaceId: string) {
    const curr = memento.get<Record<string, EnvironmentMemento>>(CAWS_RECONNECT_KEY, {})
    delete curr[workspaceId]
    return memento.update(CAWS_RECONNECT_KEY, curr)
}

async function openReconnectedWorkspace(
    cawsClient: ConnectedCawsClient,
    id: string,
    environment: EnvironmentMemento,
    closeRootInstance: boolean
): Promise<void> {
    const devEnv = await cawsClient.getDevelopmentWorkspace({
        id,
        organizationName: environment.organizationName,
        projectName: environment.projectName,
    })
    await openDevEnv(cawsClient, devEnv, environment.previousOpenWorkspace)

    // When we only have 1 workspace to watch we might as well close the local vscode instance
    if (closeRootInstance) {
        vscode.commands.executeCommand('workbench.action.closeWindow')
    }
}

function getWorkspaceName(alias: string | undefined, id: string) {
    return alias && alias !== '' ? alias : id
}

export function isLongReconnect(oldSettings: WorkspaceSettings, newSettings: WorkspaceSettings): boolean {
    return (
        newSettings.inactivityTimeoutMinutes !== undefined &&
        newSettings.instanceType !== undefined &&
        (oldSettings.inactivityTimeoutMinutes !== newSettings.inactivityTimeoutMinutes ||
            oldSettings.instanceType !== newSettings.instanceType)
    )
}

export function saveReconnectionInformation(
    devEnv: Pick<DevelopmentWorkspace, 'id' | 'org' | 'project' | 'alias'>
): Thenable<void> {
    const memento = globals.context.globalState
    const pendingReconnects = memento.get<Record<string, EnvironmentMemento>>(CAWS_RECONNECT_KEY, {})
    const workspaceFolders = vscode.workspace.workspaceFolders
    const currentWorkspace =
        workspaceFolders !== undefined && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : '/projects'
    pendingReconnects[devEnv.id] = {
        previousOpenWorkspace: currentWorkspace,
        organizationName: devEnv.org.name,
        projectName: devEnv.project.name,
        attemptingReconnect: false,
        previousConnectionTimestamp: Date.now(),
        alias: devEnv.alias,
    }
    return memento.update(CAWS_RECONNECT_KEY, pendingReconnects)
}

export function removeReconnectionInformation(devEnvId: DevEnvId): Thenable<void> {
    const memento = globals.context.globalState
    const pendingReconnects = memento.get<Record<string, EnvironmentMemento>>(CAWS_RECONNECT_KEY, {})
    delete pendingReconnects[devEnvId.id]
    return memento.update(CAWS_RECONNECT_KEY, pendingReconnects)
}
