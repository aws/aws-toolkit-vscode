/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import * as vscode from 'vscode'
import { CodeCatalystClient, createClient, DevEnvironment } from '../shared/clients/codecatalystClient'
import { ExtContext } from '../shared/extensions'
import { getLogger } from '../shared/logger'
import { sleep } from '../shared/utilities/timeoutUtils'
import { DevEnvironmentSettings } from './commands'
import { codeCatalystConnectCommand, codecatalystReconnectKey, DevEnvironmentId, DevEnvMemento } from './model'
import { showViewLogsMessage } from '../shared/utilities/messages'
import { CodeCatalystAuthenticationProvider } from './auth'
import { getCodeCatalystDevEnvId } from '../shared/vscode/env'
import globals from '../shared/extensionGlobals'
import { recordSource } from './utils'

const localize = nls.loadMessageBundle()

const reconnectTimer = 5000
const maxReconnectTime = 10 * 60 * 1000

export function watchRestartingDevEnvs(ctx: ExtContext, authProvider: CodeCatalystAuthenticationProvider) {
    let restartHandled = false
    authProvider.onDidChangeActiveConnection(async conn => {
        if (restartHandled || conn === undefined) {
            return
        }

        const client = await createClient(conn)
        const envId = getCodeCatalystDevEnvId()
        handleRestart(client, ctx, envId)
        restartHandled = true
    })
}

function handleRestart(client: CodeCatalystClient, ctx: ExtContext, envId: string | undefined) {
    if (envId !== undefined) {
        const memento = ctx.extensionContext.globalState
        const pendingReconnects = memento.get<Record<string, DevEnvMemento>>(codecatalystReconnectKey, {})
        if (envId in pendingReconnects) {
            const devenv = pendingReconnects[envId]
            const devenvName = getDevEnvName(devenv.alias, envId)
            getLogger().info(`codecatalyst: ssh session reconnected to devenv: ${devenvName}`)
            vscode.window.showInformationMessage(
                localize('AWS.codecatalyst.reconnect.success', 'Reconnected to Dev Environment: {0}', devenvName)
            )
            delete pendingReconnects[envId]
            memento.update(codecatalystReconnectKey, pendingReconnects)
        }
    } else {
        getLogger().info('codecatalyst: attempting to poll development envionments')

        // Reconnect devenvs (if coming from a restart)
        reconnectDevEnvs(client, ctx).catch(err => {
            getLogger().error(`codecatalyst: error while resuming devenvs: ${err}`)
        })
    }
}

/**
 * Attempt to poll for connection in all valid devenvs
 * @param client a connected client
 * @param ctx the extension context
 */
async function reconnectDevEnvs(client: CodeCatalystClient, ctx: ExtContext): Promise<void> {
    const memento = ctx.extensionContext.globalState
    const pendingDevEnvs = memento.get<Record<string, DevEnvMemento>>(codecatalystReconnectKey, {})
    const validDevEnvs = filterInvalidDevEnvs(pendingDevEnvs)
    if (Object.keys(validDevEnvs).length === 0) {
        return
    }

    const devenvNames = []
    for (const [id, devenv] of Object.entries(validDevEnvs)) {
        devenvNames.push(getDevEnvName(devenv.alias, id))
    }

    const polledDevEnvs = devenvNames.join(', ')
    const progressTitle = localize(
        'AWS.codecatalyst.reconnect.restarting',
        'The following devenvs are restarting: {0}',
        polledDevEnvs
    )
    vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
        },
        (progress, token) => {
            progress.report({ message: progressTitle })
            return pollDevEnvs(client, progress, token, memento, validDevEnvs)
        }
    )
}

/**
 * Filter out devenvs who are expired OR are already attempting to reconnect.
 * @param devenvs All of the possible in devenvs to check
 */
function filterInvalidDevEnvs(devenvs: Record<string, DevEnvMemento>) {
    for (const reconnectDevEnvId in devenvs) {
        const devenvDetail = devenvs[reconnectDevEnvId]
        if (isExpired(devenvDetail.previousConnectionTimestamp) || devenvDetail.attemptingReconnect) {
            delete devenvs[reconnectDevEnvId]
        }
    }
    return devenvs
}

/**
 * Ensure that all devenvs that are currently being looked at set to attempting to reconnect so that they are not looked at
 * by any other instance of VSCode.
 * @param memento
 * @param devenvs
 */
function setWatchedDevEnvStatus(memento: vscode.Memento, devenvs: Record<string, DevEnvMemento>, watchStatus: boolean) {
    for (const [id, detail] of Object.entries(devenvs)) {
        devenvs[id] = { ...detail, attemptingReconnect: watchStatus }
    }
    return memento.update(codecatalystReconnectKey, devenvs)
}

/**
 * Continuously poll all the devenvs until they are either:
 *      1. Available for re-opening, in which case re-open them automatically
 *      2. In a terminating state or expired, in which case no longer watch the devenv
 *      3. Failed to start, in which case notify the user
 * @param client A connected client
 * @param memento vscode global storage library
 * @param devenvs All VALID devenvs that are not being watched by any other VSCode instance
 */
async function pollDevEnvs(
    client: CodeCatalystClient,
    progress: vscode.Progress<{ message: string }>,
    token: vscode.CancellationToken,
    memento: vscode.Memento,
    devenvs: Record<string, DevEnvMemento>
) {
    // Ensure that all devenvs that you want to look at are attempting reconnection
    // and won't be watched by any other VSCode instance
    await setWatchedDevEnvStatus(memento, devenvs, true)

    const shouldCloseRootInstance = Object.keys(devenvs).length === 1

    while (Object.keys(devenvs).length > 0) {
        if (token.isCancellationRequested) {
            await setWatchedDevEnvStatus(memento, devenvs, false)
            return
        }

        for (const id in devenvs) {
            const details = devenvs[id]

            const devenvName = getDevEnvName(details.alias, id)

            try {
                const metadata = await client.getDevEnvironment({
                    id: id,
                    spaceName: details.spaceName,
                    projectName: details.projectName,
                })

                if (metadata?.status === 'RUNNING') {
                    progress.report({
                        message: `Dev Environment ${devenvName} is now running. Attempting to reconnect.`,
                    })

                    openReconnectedDevEnv(client, id, details, shouldCloseRootInstance)

                    // We no longer need to watch this devenv anymore because it's already being re-opened in SSH
                    delete devenvs[id]
                } else if (isTerminating(metadata)) {
                    progress.report({ message: `Dev Environment ${devenvName} is terminating` })
                    // We no longer need to watch a devenv that is in a terminating state
                    delete devenvs[id]
                } else if (isExpired(details.previousConnectionTimestamp)) {
                    progress.report({ message: `Dev Environment ${devenvName} has expired` })
                }
            } catch {
                await failDevEnv(memento, id)
                delete devenvs[id]
                showViewLogsMessage(localize('AWS.codecatalyst.reconnect', 'Unable to reconnect to ${0}', devenvName))
            }
        }
        await sleep(reconnectTimer)
    }
}

function isTerminating(devenv: Pick<DevEnvironment, 'status'>): boolean {
    if (!devenv.status) {
        return false
    }

    return devenv.status === 'FAILED' || devenv.status === 'DELETING' || devenv.status === 'DELETED'
}

function isExpired(previousConnectionTime: number): boolean {
    return Date.now() - previousConnectionTime > maxReconnectTime
}

/**
 * When a devenv fails, remove it from the memento so we no longer watch it in the future
 * @param memento The memento instance from vscode
 * @param devenvId the id of the deveng to fail
 */
function failDevEnv(memento: vscode.Memento, devenvId: string) {
    const curr = memento.get<Record<string, DevEnvMemento>>(codecatalystReconnectKey, {})
    delete curr[devenvId]
    return memento.update(codecatalystReconnectKey, curr)
}

async function openReconnectedDevEnv(
    client: CodeCatalystClient,
    id: string,
    devenv: DevEnvMemento,
    closeRootInstance: boolean
): Promise<void> {
    const identifier: DevEnvironmentId = {
        id,
        org: { name: devenv.spaceName },
        project: { name: devenv.projectName },
    }

    recordSource('Reconnect')
    await codeCatalystConnectCommand.execute(client, identifier, devenv.previousVscodeWorkspace)

    // When we only have 1 devenv to watch we might as well close the local vscode instance
    if (closeRootInstance) {
        // A brief delay ensures that metrics are saved from the connect command
        sleep(5000).then(() => vscode.commands.executeCommand('workbench.action.closeWindow'))
    }
}

function getDevEnvName(alias: string | undefined, id: string) {
    return alias && alias !== '' ? alias : id
}

export function isLongReconnect(oldSettings: DevEnvironmentSettings, newSettings: DevEnvironmentSettings): boolean {
    return (
        newSettings.inactivityTimeoutMinutes !== undefined &&
        newSettings.instanceType !== undefined &&
        (oldSettings.inactivityTimeoutMinutes !== newSettings.inactivityTimeoutMinutes ||
            oldSettings.instanceType !== newSettings.instanceType)
    )
}

export function saveReconnectionInformation(devenv: DevEnvironmentId & Pick<DevEnvironment, 'alias'>): Thenable<void> {
    const memento = globals.context.globalState
    const pendingReconnects = memento.get<Record<string, DevEnvMemento>>(codecatalystReconnectKey, {})
    const workspaceFolders = vscode.workspace.workspaceFolders
    const currentWorkspace =
        workspaceFolders !== undefined && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : '/projects'
    pendingReconnects[devenv.id] = {
        previousVscodeWorkspace: currentWorkspace,
        spaceName: devenv.org.name,
        projectName: devenv.project.name,
        attemptingReconnect: false,
        previousConnectionTimestamp: Date.now(),
        alias: devenv.alias,
    }
    return memento.update(codecatalystReconnectKey, pendingReconnects)
}

export function removeReconnectionInformation(devenv: DevEnvironmentId): Thenable<void> {
    const memento = globals.context.globalState
    const pendingReconnects = memento.get<Record<string, DevEnvMemento>>(codecatalystReconnectKey, {})
    delete pendingReconnects[devenv.id]
    return memento.update(codecatalystReconnectKey, pendingReconnects)
}
