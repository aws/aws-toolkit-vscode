/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { getLogger } from '../../shared/logger/logger'
import { isRemoteWorkspace } from '../../shared/vscode/env'
import { SagemakerDevSpaceNode } from './explorer/sagemakerDevSpaceNode'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import { SagemakerConstants } from './explorer/constants'
import { SagemakerHyperpodNode } from './explorer/sagemakerHyperpodNode'
import { createConnectionKey, storeHyperpodConnection } from './detached-server/hyperpodMappingUtils'
import { HyperpodReconnectionManager } from './hyperpodReconnection'
import { HyperpodConnectionMonitor } from './hyperpodConnectionMonitor'
import { startLocalServer, prepareDevEnvConnection } from './model'
import { startVscodeRemote } from '../../shared/extensions/ssh'
import globals from '../../shared/extensionGlobals'
import { clearSSHHostKey } from './hyperpodUtils'

const localize = nls.loadMessageBundle()

export async function openHyperPodRemoteConnection(node: SagemakerDevSpaceNode): Promise<void> {
    await startHyperpodSpaceCommand(node)
    await waitForDevSpaceRunning(node)
    await connectToHyperPodDevSpace(node)
}

async function waitForDevSpaceRunning(node: SagemakerDevSpaceNode): Promise<void> {
    const kubectlClient = node.getParent().getKubectlClient(node.hpCluster.clusterName)
    if (!kubectlClient) {
        getLogger().error(`No kubectlClient available for cluster: ${node.hpCluster.clusterName}`)
        return
    }
    const timeout = 5 * 60 * 1000 // 5 minutes
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
        const status = await kubectlClient.getHyperpodSpaceStatus(node.devSpace)
        if (status === 'Running') {
            return
        }
        await new Promise((resolve) => setTimeout(resolve, 5000))
    }

    throw new Error('Timeout waiting for dev space to reach Running status')
}

export async function connectToHyperPodDevSpace(node: SagemakerDevSpaceNode): Promise<void> {
    const logger = getLogger()

    if (isRemoteWorkspace()) {
        void vscode.window.showErrorMessage(
            'Cannot connect to HyperPod from a remote workspace. Please use a local VS Code instance.'
        )
        return
    }

    try {
        const kubectlClient = node.getParent().getKubectlClient(node.hpCluster.clusterName)
        if (!kubectlClient) {
            logger.error(`No kubectlClient available for cluster: ${node.hpCluster.clusterName}`)
            return
        }

        const connectionKey = createConnectionKey(
            node.devSpace.name,
            node.devSpace.namespace,
            node.hpCluster.clusterName
        )

        try {
            await startLocalServer(globals.context)

            const eksCluster = kubectlClient.getEksCluster()
            if (!eksCluster?.endpoint || !eksCluster?.certificateAuthority?.data) {
                throw new Error('EKS cluster information is required but not available')
            }
            await storeHyperpodConnection(
                node.devSpace.name,
                node.devSpace.namespace,
                node.hpCluster.clusterArn,
                node.hpCluster.clusterName,
                node.devSpace.cluster,
                eksCluster.endpoint,
                eksCluster.certificateAuthority.data,
                node.regionCode
            )

            const reconnectionManager = HyperpodReconnectionManager.getInstance()
            reconnectionManager.scheduleReconnection(connectionKey)

            const connectionMonitor = HyperpodConnectionMonitor.getInstance()
            connectionMonitor.startMonitoring(connectionKey)
        } catch (error) {
            getLogger().warn(`Failed to store HyperPod connection info: ${error}`)
        }

        await clearSSHHostKey(connectionKey, node.regionCode, node.hpCluster.clusterArn.split(':')[4])

        const remoteEnv = await prepareDevEnvConnection(
            '',
            globals.context,
            'sm_hp',
            false,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            node.devSpace.name,
            node.hpCluster.clusterName,
            node.devSpace.namespace,
            node.regionCode,
            node.hpCluster.clusterArn
        )

        await startVscodeRemote(
            remoteEnv.SessionProcess,
            remoteEnv.hostname,
            '/home/sagemaker-user',
            remoteEnv.vscPath,
            'sagemaker-user'
        )

        void vscode.window.showInformationMessage(
            `Connected to HyperPod dev space: ${node.devSpace.name} (${node.devSpace.namespace})`
        )
    } catch (error) {
        logger.error(`Failed to connect to HyperPod dev space: ${error}`)
        void vscode.window.showErrorMessage(
            `Failed to connect to HyperPod dev space: ${error instanceof Error ? error.message : String(error)}`
        )
    }
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
    node.updateWorkspace()
    await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', node)

    const kc = node.getParent().getKubectlClient(node.hpCluster.clusterName)
    if (!kc) {
        getLogger().error(`Failed to start space (${node.devSpace.name}) due to unavailable kubectl client`)
        return
    }
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
    node.updateWorkspace()
    await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', node)

    const kc = node.getParent().getKubectlClient(node.hpCluster.clusterName)
    if (!kc) {
        getLogger().error(`Failed to start space (${node.devSpace.name}) due to unavailable kubectl client`)
        return
    }
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
