/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { getLogger } from '../../shared/logger/logger'
import { SagemakerDevSpaceNode } from './explorer/sagemakerDevSpaceNode'
import { showConfirmationMessage } from '../../shared/utilities/messages'

const localize = nls.loadMessageBundle()

export async function openHyperPodRemoteConnection(node: SagemakerDevSpaceNode): Promise<void> {
    await startHyperpodSpaceCommand(node)
}

export async function startHyperpodSpaceCommand(node: SagemakerDevSpaceNode): Promise<void> {
    if (node.devSpace.status === 'Invalid') {
        void vscode.window.showErrorMessage(`Error: Cannot start an invalid space`)
        throw new Error(`Error: Cannot start an invalid space`)
    }
    if (node.devSpace.status === 'Error') {
        void vscode.window.showErrorMessage(`Error: Cannot start space until resolved`)
        throw new Error(`Error: Cannot start space until resolved`)
    }
    if (node.devSpace.status === 'Running') {
        return
    }
    // Set transitional state immediately
    node.devSpace.status = 'Starting'
    node.contextValue = 'awsSagemakerHyperpodDevSpaceTransitionalNode'
    await node.refreshNode()

    const kc = node.getParent().getKubectlClient(node.hpCluster.clusterName)
    await kc.startHyperpodDevSpace(node)
}

export async function stopHyperPodSpaceCommand(node: SagemakerDevSpaceNode): Promise<void> {
    const confirmed = await showConfirmationMessage({
        prompt: `You are about to stop this space. Any active resource will also be stopped. Are you sure you want to stop the space?`,
        confirm: 'Stop Space',
        cancel: 'Cancel',
        type: 'warning',
    })

    if (!confirmed) {
        return
    }

    if (node.devSpace.status === 'Error') {
        void vscode.window.showErrorMessage(`Error: Cannot stop space until resolved`)
        throw new Error(`Error: Cannot stop space until resolved`)
    }

    // Set transitional state immediately
    node.devSpace.status = 'Stopping'
    node.contextValue = 'awsSagemakerHyperpodDevSpaceTransitionalNode'
    await node.refreshNode()

    const kc = node.getParent().getKubectlClient(node.hpCluster.clusterName)
    await kc.stopHyperpodDevSpace(node)
}

export async function filterDevSpacesByNamespaceCluster(hpNode: SagemakerHyperpodNode): Promise<void> {
    if (hpNode.clusterNamespaces.size === 0) {
        // if hyperpodNode has not been expanded, then devSpaceNodes will be empty
        // if so, this will attempt to populate devSpaceNodes
        await hpNode.updateChildren()
        if (hpNode.clusterNamespaces.size === 0) {
            getLogger().info(SagemakerConstants.NoDevSpaceToFilter)
            void vscode.window.showInformationMessage(SagemakerConstants.NoDevSpaceToFilter)
            return
        }
    }

    // Sort by EKS cluster name and namespace
    const sortedClusterNamespaces = new Map(
        [...hpNode.clusterNamespaces].sort((a, b) => {
            const clusterA = a[1].cluster
            const clusterB = b[1].cluster
            const namespaceA = a[1].namespace
            const namespaceB = b[1].namespace

            return clusterA.localeCompare(clusterB) || namespaceA.localeCompare(namespaceB)
        })
    )

    const previousSelection = await hpNode.getSelectedClusterNamespaces()
    const items: (vscode.QuickPickItem & { key: string })[] = []

    for (const [_, devSpace] of sortedClusterNamespaces) {
        const filterKey = `${devSpace.cluster}-${devSpace.namespace}`
        items.push({
            label: devSpace.namespace,
            detail: `In cluster: ${devSpace.cluster}`,
            picked: previousSelection.has(filterKey),
            key: filterKey,
        })
    }

    const placeholder = localize(
        SagemakerConstants.FilterHyperpodPlaceholderKey,
        SagemakerConstants.FilterHyperpodPlaceholderMessage
    )
    const result = await vscode.window.showQuickPick(items, {
        placeHolder: placeholder,
        canPickMany: true,
        matchOnDetail: true,
    })

    if (!result) {
        return // User canceled
    }

    const newSelection = result.map((r) => r.key)
    if (newSelection.length !== previousSelection.size || newSelection.some((key) => !previousSelection.has(key))) {
        hpNode.saveSelectedClusterNamespaces(newSelection)
        await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', hpNode)
    }
}
