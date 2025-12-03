/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { SagemakerConstants } from './explorer/constants'
import { SagemakerStudioNode } from './explorer/sagemakerStudioNode'
import { DomainKeyDelimiter } from './utils'
import { startVscodeRemote } from '../../shared/extensions/ssh'
import { getLogger } from '../../shared/logger/logger'
import { SagemakerSpaceNode, tryRefreshNode } from './explorer/sagemakerSpaceNode'
import { isRemoteWorkspace } from '../../shared/vscode/env'
import _ from 'lodash'
import { prepareDevEnvConnection, tryRemoteConnection } from './model'
import { ExtContext } from '../../shared/extensions'
import { SagemakerClient } from '../../shared/clients/sagemaker'
import { AccessDeniedException } from '@amzn/sagemaker-client'
import { ToolkitError } from '../../shared/errors'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import { RemoteSessionError } from '../../shared/remoteSession'
import {
    ConnectFromRemoteWorkspaceMessage,
    InstanceTypeError,
    InstanceTypeInsufficientMemory,
    InstanceTypeInsufficientMemoryMessage,
    RemoteAccess,
    RemoteAccessRequiredMessage,
    SpaceStatus,
} from './constants'
import { SagemakerUnifiedStudioSpaceNode } from '../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioSpaceNode'
import { node } from 'webpack'

const localize = nls.loadMessageBundle()

export async function filterSpaceAppsByDomainUserProfiles(studioNode: SagemakerStudioNode): Promise<void> {
    if (studioNode.domainUserProfiles.size === 0) {
        // if studioNode has not been expanded, domainUserProfiles will be empty
        // if so, this will attempt to populate domainUserProfiles
        await studioNode.updateChildren()
        if (studioNode.domainUserProfiles.size === 0) {
            getLogger().info(SagemakerConstants.NoSpaceToFilter)
            void vscode.window.showInformationMessage(SagemakerConstants.NoSpaceToFilter)
            return
        }
    }

    // Sort by domain name and user profile
    const sortedDomainUserProfiles = new Map(
        [...studioNode.domainUserProfiles].sort((a, b) => {
            const domainNameA = a[1].domain.DomainName || ''
            const domainNameB = b[1].domain.DomainName || ''

            const [_domainIdA, userProfileA] = a[0].split(DomainKeyDelimiter)
            const [_domainIdB, userProfileB] = b[0].split(DomainKeyDelimiter)

            return domainNameA.localeCompare(domainNameB) || userProfileA.localeCompare(userProfileB)
        })
    )

    const previousSelection = await studioNode.getSelectedDomainUsers()
    const items: (vscode.QuickPickItem & { key: string })[] = []

    for (const [key, userMetadata] of sortedDomainUserProfiles) {
        const [_, userProfile] = key.split(DomainKeyDelimiter)
        items.push({
            label: userProfile,
            detail: `In domain: ${userMetadata.domain?.DomainName}`,
            picked: previousSelection.has(key),
            key,
        })
    }

    const placeholder = localize(SagemakerConstants.FilterPlaceholderKey, SagemakerConstants.FilterPlaceholderMessage)
    const result = await vscode.window.showQuickPick(items, {
        placeHolder: placeholder,
        canPickMany: true,
        matchOnDetail: true,
    })

    if (!result) {
        return // User canceled.
    }

    const newSelection = result.map((r) => r.key)
    if (newSelection.length !== previousSelection.size || newSelection.some((key) => !previousSelection.has(key))) {
        studioNode.saveSelectedDomainUsers(newSelection)
        await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', studioNode)
    }
}

export async function deeplinkConnect(
    ctx: ExtContext,
    connectionIdentifier: string,
    session: string,
    wsUrl: string,
    token: string,
    domain: string,
    appType?: string,
    workspaceName?: string,
    namespace?: string,
    eksClusterArn?: string,
    isSMUS: boolean = false
) {
    getLogger().debug(
        'sm:deeplinkConnect: connectionIdentifier: %s session: %s wsUrl: %s token: %s isSMUS: %s',
        connectionIdentifier,
        session,
        wsUrl,
        token,
        isSMUS
    )

    getLogger().info(
        `sm:deeplinkConnect: 
        domain: ${domain}, 
        appType: ${appType}, 
        workspaceName: ${workspaceName}, 
        namespace: ${namespace}, 
        eksClusterArn: ${eksClusterArn}`
    )

    getLogger().info(
        `sm:deeplinkConnect: domain: ${domain}, appType: ${appType}, workspaceName: ${workspaceName}, namespace: ${namespace}, eksClusterArn: ${eksClusterArn}`
    )

    if (isRemoteWorkspace()) {
        void vscode.window.showErrorMessage(ConnectFromRemoteWorkspaceMessage)
        return
    }

    try {
        let connectionType = 'sm_dl'
        if (domain === '' && eksClusterArn) {
            const { accountId, region, clusterName } = parseEKSClusterArn(eksClusterArn)
            connectionType = 'sm_hp'
            session = `${workspaceName}_${namespace}_${clusterName}_${region}_${accountId}`
        }
        const remoteEnv = await prepareDevEnvConnection(
            connectionIdentifier,
            ctx.extensionContext,
            connectionType,
            isSMUS /* isSMUS */,
            undefined /* node */,
            session,
            wsUrl,
            token,
            domain,
            appType
        )

        try {
            await startVscodeRemote(
                remoteEnv.SessionProcess,
                remoteEnv.hostname,
                '/home/sagemaker-user',
                remoteEnv.vscPath,
                'sagemaker-user'
            )
        } catch (remoteErr: any) {
            throw new ToolkitError(
                `Failed to establish remote connection: ${remoteErr.message}. Check Remote-SSH logs for details.`,
                { cause: remoteErr, code: remoteErr.code || 'RemoteConnectionFailed' }
            )
        }
    } catch (err: any) {
        getLogger().error(
            'sm:OpenRemoteConnect: Unable to connect to target space with arn: %s error: %s isSMUS: %s',
            connectionIdentifier,
            err,
            isSMUS
        )

        if (![RemoteSessionError.MissingExtension, RemoteSessionError.ExtensionVersionTooLow].includes(err.code)) {
            void vscode.window.showErrorMessage(
                `Remote connection failed: ${err.message || 'Unknown error'}. Check Output > Log (Window) for details.`
            )
            throw err
        }
    }
}

function parseEKSClusterArn(eksClusterArn: string): { accountId: string; region: string; clusterName: string } {
    const parts = eksClusterArn.split(':')
    if (parts.length !== 6) {
        throw new Error(`Invalid EKS cluster ARN: ${eksClusterArn}`)
    }
    const accountId = parts[4]
    const region = parts[3]
    const clusterName = parts[5].split('/')[1]
    return { accountId, region, clusterName }
}

export async function stopSpace(
    node: SagemakerSpaceNode | SagemakerUnifiedStudioSpaceNode,
    ctx: vscode.ExtensionContext,
    sageMakerClient?: SagemakerClient
) {
    await tryRefreshNode(node)
    if (node.getStatus() === SpaceStatus.STOPPED || node.getStatus() === SpaceStatus.STOPPING) {
        void vscode.window.showWarningMessage(`Space ${node.spaceApp.SpaceName} is already in Stopped/Stopping state.`)
        return
    } else if (node.getStatus() === SpaceStatus.STARTING) {
        void vscode.window.showWarningMessage(
            `Space ${node.spaceApp.SpaceName} is in Starting state. Wait until it is Running to attempt stop again.`
        )
        return
    }
    const spaceName = node.spaceApp.SpaceName!
    const confirmed = await showConfirmationMessage({
        prompt: `You are about to stop this space. Any active resource will also be stopped. Are you sure you want to stop the space?`,
        confirm: 'Stop Space',
        cancel: 'Cancel',
        type: 'warning',
    })

    if (!confirmed) {
        return
    }
    //  In case of SMUS, we pass in a SM Client and for SM AI, it creates a new SM Client.
    const client = sageMakerClient ? sageMakerClient : new SagemakerClient(node.regionCode)
    try {
        await client.deleteApp({
            DomainId: node.spaceApp.DomainId!,
            SpaceName: spaceName,
            AppType: node.spaceApp.SpaceSettingsSummary!.AppType!,
            AppName: node.spaceApp.App?.AppName,
        })
    } catch (err) {
        const error = err as Error
        if (error instanceof AccessDeniedException) {
            throw new ToolkitError('You do not have permission to stop spaces. Please contact your administrator', {
                cause: error,
                code: error.name,
            })
        } else {
            throw new ToolkitError(`Failed to stop space ${spaceName}: ${(error as Error).message}`, {
                cause: error,
                code: error.name,
            })
        }
    }
    await tryRefreshNode(node)
}

export async function openRemoteConnect(
    node: SagemakerSpaceNode | SagemakerUnifiedStudioSpaceNode,
    ctx: vscode.ExtensionContext,
    sageMakerClient?: SagemakerClient
) {
    if (isRemoteWorkspace()) {
        void vscode.window.showErrorMessage(ConnectFromRemoteWorkspaceMessage)
        return
    }

    const spaceName = node.spaceApp.SpaceName!
    await tryRefreshNode(node)

    const remoteAccess = node.spaceApp.SpaceSettingsSummary?.RemoteAccess
    const nodeStatus = node.getStatus()

    // Route to appropriate handler based on space state
    if (nodeStatus === SpaceStatus.RUNNING && remoteAccess !== RemoteAccess.ENABLED) {
        return handleRunningSpaceWithDisabledAccess(node, ctx, spaceName, sageMakerClient)
    } else if (nodeStatus === SpaceStatus.STOPPED) {
        return handleStoppedSpace(node, ctx, spaceName, sageMakerClient)
    } else if (nodeStatus === SpaceStatus.RUNNING) {
        return handleRunningSpaceWithEnabledAccess(node, ctx, spaceName)
    }
}

/**
 * Checks if an instance type upgrade will be needed for remote access
 */
export async function checkInstanceTypeUpgradeNeeded(
    node: SagemakerSpaceNode | SagemakerUnifiedStudioSpaceNode,
    sageMakerClient?: SagemakerClient
): Promise<{ upgradeNeeded: boolean; currentType?: string; recommendedType?: string }> {
    const client = sageMakerClient || new SagemakerClient(node.regionCode)

    try {
        const spaceDetails = await client.describeSpace({
            DomainId: node.spaceApp.DomainId!,
            SpaceName: node.spaceApp.SpaceName!,
        })

        const appType = spaceDetails.SpaceSettings!.AppType!

        // Get current instance type
        const currentResourceSpec =
            appType === 'JupyterLab'
                ? spaceDetails.SpaceSettings!.JupyterLabAppSettings?.DefaultResourceSpec
                : spaceDetails.SpaceSettings!.CodeEditorAppSettings?.DefaultResourceSpec

        const currentInstanceType = currentResourceSpec?.InstanceType

        // Check if upgrade is needed
        if (currentInstanceType && currentInstanceType in InstanceTypeInsufficientMemory) {
            // Current type has insufficient memory
            return {
                upgradeNeeded: true,
                currentType: currentInstanceType,
                recommendedType: InstanceTypeInsufficientMemory[currentInstanceType],
            }
        }

        return { upgradeNeeded: false, currentType: currentInstanceType }
    } catch (err) {
        const error = err as Error
        if (error instanceof AccessDeniedException) {
            throw new ToolkitError('You do not have permission to describe spaces. Please contact your administrator', {
                cause: error,
                code: error.name,
            })
        }
        throw err
    }
}

/**
 * Handles connecting to a running space with disabled remote access
 * Requires stopping the space, enabling remote access, and restarting
 */
async function handleRunningSpaceWithDisabledAccess(
    node: SagemakerSpaceNode | SagemakerUnifiedStudioSpaceNode,
    ctx: vscode.ExtensionContext,
    spaceName: string,
    sageMakerClient?: SagemakerClient
) {
    // Check if instance type upgrade will be needed
    const instanceTypeInfo = await checkInstanceTypeUpgradeNeeded(node, sageMakerClient)

    let prompt: string
    if (instanceTypeInfo.upgradeNeeded) {
        prompt = InstanceTypeInsufficientMemoryMessage(
            spaceName,
            instanceTypeInfo.currentType!,
            instanceTypeInfo.recommendedType!
        )
    } else {
        // Only remote access needs to be enabled
        prompt = RemoteAccessRequiredMessage
    }

    const confirmed = await showConfirmationMessage({
        prompt,
        confirm: 'Restart Space and Connect',
        cancel: 'Cancel',
        type: 'warning',
    })

    if (!confirmed) {
        return
    }

    // Enable remote access and connect
    const client = sageMakerClient || new SagemakerClient(node.regionCode)

    return await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: `Connecting to ${spaceName}`,
        },
        async (progress) => {
            try {
                // Show initial progress message
                progress.report({ message: 'Stopping the space' })

                // Stop the running space
                await client.deleteApp({
                    DomainId: node.spaceApp.DomainId!,
                    SpaceName: spaceName,
                    AppType: node.spaceApp.SpaceSettingsSummary!.AppType!,
                    AppName: node.spaceApp.App?.AppName,
                })

                // Update progress message
                progress.report({ message: 'Starting the space' })

                // Start the space with remote access enabled (skip prompts since user already consented)
                await client.startSpace(spaceName, node.spaceApp.DomainId!, true)
                await tryRefreshNode(node)
                await client.waitForAppInService(
                    node.spaceApp.DomainId!,
                    spaceName,
                    node.spaceApp.SpaceSettingsSummary!.AppType!,
                    progress
                )
                await tryRemoteConnection(node, ctx, progress)
            } catch (err: any) {
                // Handle user declining instance type upgrade
                if (err.code === InstanceTypeError) {
                    return
                }
                throw new ToolkitError(`Remote connection failed: ${err.message}`, {
                    cause: err,
                    code: err.code,
                })
            }
        }
    )
}

/**
 * Handles connecting to a stopped space
 * Starts the space and connects (remote access enabled automatically if needed)
 */
async function handleStoppedSpace(
    node: SagemakerSpaceNode | SagemakerUnifiedStudioSpaceNode,
    ctx: vscode.ExtensionContext,
    spaceName: string,
    sageMakerClient?: SagemakerClient
) {
    const client = sageMakerClient || new SagemakerClient(node.regionCode)

    try {
        await client.startSpace(spaceName, node.spaceApp.DomainId!)
        await tryRefreshNode(node)

        return await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                cancellable: false,
                title: `Connecting to ${spaceName}`,
            },
            async (progress) => {
                progress.report({ message: 'Starting the space' })
                await client.waitForAppInService(
                    node.spaceApp.DomainId!,
                    spaceName,
                    node.spaceApp.SpaceSettingsSummary!.AppType!,
                    progress
                )
                await tryRemoteConnection(node, ctx, progress)
            }
        )
    } catch (err: any) {
        // Handle user declining instance type upgrade
        if (err.code === InstanceTypeError) {
            return
        }
        throw new ToolkitError(`Remote connection failed: ${(err as Error).message}`, {
            cause: err as Error,
            code: err.code,
        })
    }
}

/**
 * Handles connecting to a running space with enabled remote access
 * Direct connection without any space modifications
 */
async function handleRunningSpaceWithEnabledAccess(
    node: SagemakerSpaceNode | SagemakerUnifiedStudioSpaceNode,
    ctx: vscode.ExtensionContext,
    spaceName: string,
    sageMakerClient?: SagemakerClient
) {
    return await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: `Connecting to ${spaceName}`,
        },
        async (progress) => {
            await tryRemoteConnection(node, ctx, progress)
        }
    )
}
