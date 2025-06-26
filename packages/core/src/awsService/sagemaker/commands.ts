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
import { SagemakerSpaceNode } from './explorer/sagemakerSpaceNode'
import { isRemoteWorkspace } from '../../shared/vscode/env'
import _ from 'lodash'
import { prepareDevEnvConnection } from './model'
import { ExtContext } from '../../shared/extensions'

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
        void vscode.window.showErrorMessage(
            'You are in a remote workspace, skipping deeplink connect. Please open from a local workspace.'
        )
        return
    }

    const remoteEnv = await prepareDevEnvConnection(
        connectionIdentifier,
        ctx.extensionContext,
        'sm_dl',
        session,
        wsUrl,
        token,
        domain
    )

    try {
        await startVscodeRemote(
            remoteEnv.SessionProcess,
            remoteEnv.hostname,
            '/home/sagemaker-user',
            remoteEnv.vscPath,
            'sagemaker-user'
        )
    } catch (err) {
        getLogger().error(
            `sm:OpenRemoteConnect: Unable to connect to target space with arn: ${connectionIdentifier} error: ${err}`
        )
    }
}

export async function openRemoteConnect(node: SagemakerSpaceNode, ctx: vscode.ExtensionContext) {
    getLogger().debug(
        `sm:openRemoteConnect: node: ${node.toString()} appArn: ${await node.getAppArn()} region: ${node.regionCode}`
    )

    const spaceArn = (await node.getSpaceArn()) as string
    const remoteEnv = await prepareDevEnvConnection(spaceArn, ctx, 'sm_lc')

    try {
        await startVscodeRemote(
            remoteEnv.SessionProcess,
            remoteEnv.hostname,
            '/home/sagemaker-user',
            remoteEnv.vscPath,
            'sagemaker-user'
        )
    } catch (err) {
        getLogger().error(
            `sm:OpenRemoteConnect: Unable to connect to target space with arn: ${await node.getAppArn()} error: ${err}`
        )
    }
}
