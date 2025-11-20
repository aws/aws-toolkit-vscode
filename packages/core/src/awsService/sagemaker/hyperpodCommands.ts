/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SagemakerDevSpaceNode } from './explorer/sagemakerDevSpaceNode'
import { showConfirmationMessage } from '../../shared/utilities/messages'

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
