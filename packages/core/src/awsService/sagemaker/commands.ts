/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { SagemakerConstants } from './explorer/constants'
import { SagemakerParentNode } from './explorer/sagemakerParentNode'
import { DomainKeyDelimiter } from './utils'
import { startVscodeRemote } from '../../shared/extensions/ssh'
import { getLogger } from '../../shared/logger/logger'
import { SagemakerSpaceNode, tryRefreshNode } from './explorer/sagemakerSpaceNode'
import { isRemoteWorkspace } from '../../shared/vscode/env'
import _ from 'lodash'
import { prepareDevEnvConnection, tryRemoteConnection } from './model'
import { ExtContext } from '../../shared/extensions'
import { SagemakerClient } from '../../shared/clients/sagemaker'
import { ToolkitError } from '../../shared/errors'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import { RemoteSessionError } from '../../shared/remoteSession'
import { ConnectFromRemoteWorkspaceMessage, InstanceTypeError } from './constants'

const localize = nls.loadMessageBundle()

export async function filterSpaceAppsByDomainUserProfiles(parentNode: SagemakerParentNode): Promise<void> {
    if (parentNode.domainUserProfiles.size === 0) {
        // if parentNode has not been expanded, domainUserProfiles will be empty
        // if so, this will attempt to populate domainUserProfiles
        await parentNode.updateChildren()
        if (parentNode.domainUserProfiles.size === 0) {
            getLogger().info(SagemakerConstants.NoSpaceToFilter)
            void vscode.window.showInformationMessage(SagemakerConstants.NoSpaceToFilter)
            return
        }
    }

    // Sort by domain name and user profile
    const sortedDomainUserProfiles = new Map(
        [...parentNode.domainUserProfiles].sort((a, b) => {
            const domainNameA = a[1].domain.DomainName || ''
            const domainNameB = b[1].domain.DomainName || ''

            const [_domainIdA, userProfileA] = a[0].split(DomainKeyDelimiter)
            const [_domainIdB, userProfileB] = b[0].split(DomainKeyDelimiter)

            return domainNameA.localeCompare(domainNameB) || userProfileA.localeCompare(userProfileB)
        })
    )

    const previousSelection = await parentNode.getSelectedDomainUsers()
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
        parentNode.saveSelectedDomainUsers(newSelection)
        await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', parentNode)
    }
}

export async function deeplinkConnect(
    ctx: ExtContext,
    connectionIdentifier: string,
    session: string,
    wsUrl: string,
    token: string,
    domain: string
) {
    getLogger().debug(
        `sm:deeplinkConnect: connectionIdentifier: ${connectionIdentifier} session: ${session} wsUrl: ${wsUrl} token: ${token}`
    )

    if (isRemoteWorkspace()) {
        void vscode.window.showErrorMessage(ConnectFromRemoteWorkspaceMessage)
        return
    }

    try {
        const remoteEnv = await prepareDevEnvConnection(
            connectionIdentifier,
            ctx.extensionContext,
            'sm_dl',
            session,
            wsUrl,
            token,
            domain
        )

        await startVscodeRemote(
            remoteEnv.SessionProcess,
            remoteEnv.hostname,
            '/home/sagemaker-user',
            remoteEnv.vscPath,
            'sagemaker-user'
        )
    } catch (err: any) {
        getLogger().error(
            `sm:OpenRemoteConnect: Unable to connect to target space with arn: ${connectionIdentifier} error: ${err}`
        )

        if (![RemoteSessionError.MissingExtension, RemoteSessionError.ExtensionVersionTooLow].includes(err.code)) {
            throw err
        }
    }
}

export async function stopSpace(node: SagemakerSpaceNode, ctx: vscode.ExtensionContext) {
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

    const client = new SagemakerClient(node.regionCode)
    try {
        await client.deleteApp({
            DomainId: node.spaceApp.DomainId!,
            SpaceName: spaceName,
            AppType: node.spaceApp.App!.AppType!,
            AppName: node.spaceApp.App?.AppName,
        })
    } catch (err) {
        const error = err as Error
        if (error.name === 'AccessDeniedException') {
            throw new ToolkitError('You do not have permission to stop spaces. Please contact your administrator', {
                cause: error,
            })
        } else {
            throw err
        }
    }
    await tryRefreshNode(node)
}

export async function openRemoteConnect(node: SagemakerSpaceNode, ctx: vscode.ExtensionContext) {
    if (isRemoteWorkspace()) {
        void vscode.window.showErrorMessage(ConnectFromRemoteWorkspaceMessage)
        return
    }

    if (node.getStatus() === 'Stopped') {
        const client = new SagemakerClient(node.regionCode)

        try {
            await client.startSpace(node.spaceApp.SpaceName!, node.spaceApp.DomainId!)
            await tryRefreshNode(node)
            const appType = node.spaceApp.SpaceSettingsSummary?.AppType
            if (!appType) {
                throw new ToolkitError('AppType is undefined for the selected space. Cannot start remote connection.')
            }
            await client.waitForAppInService(node.spaceApp.DomainId!, node.spaceApp.SpaceName!, appType)
            await tryRemoteConnection(node, ctx)
        } catch (err: any) {
            // Ignore InstanceTypeError since it means the user decided not to use an instanceType with more memory
            if (err.code !== InstanceTypeError) {
                throw err
            }
        }
    } else if (node.getStatus() === 'Running') {
        await tryRemoteConnection(node, ctx)
    }
}
