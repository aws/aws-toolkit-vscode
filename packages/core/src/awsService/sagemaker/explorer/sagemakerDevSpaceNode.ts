/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { HyperpodCluster, HyperpodDevSpace } from '../../../shared/clients/kubectlClient'
import { SagemakerHyperpodNode } from './sagemakerHyperpodNode'
import { getIcon } from '../../../shared/icons'
import { getLogger } from '../../../shared/logger/logger'

export const devSpaceContextValueStopped = 'awsSagemakerHyperpodDevSpaceStoppedNode'
export const devSpaceContextValueRunning = 'awsSagemakerHyperpodDevSpaceRunningNode'
export const devSpaceContextValueTransitional = 'awsSagemakerHyperpodDevSpaceTransitionalNode'
export const devSpaceContextValueError = 'awsSagemakerHyperpodDevSpaceErrorNode'
export const devSpaceContextValueInvalid = 'awsSagemakerHyperpodDevSpaceInvalidNode'

export class SagemakerDevSpaceNode extends AWSTreeNodeBase {
    public hyperpodDevSpace: HyperpodDevSpace
    public hyperpodCluster: HyperpodCluster

    public constructor(
        public readonly parent: SagemakerHyperpodNode,
        public readonly devSpace: HyperpodDevSpace,
        cluster: HyperpodCluster,
        public override readonly regionCode: string
    ) {
        super('')
        this.hyperpodDevSpace = devSpace
        this.hyperpodCluster = cluster
        this.updateWorkspace()
    }

    public updateWorkspace() {
        this.label = this.buildLabel()
        this.description = this.buildDescription()
        this.tooltip = new vscode.MarkdownString(this.buildTooltip())
        this.iconPath = this.buildIconPath()
        this.contextValue = this.getContext()
        if (this.isPending()) {
            this.parent.trackPendingNode(this.getDevSpaceKey())
        }
    }

    public buildLabel(): string {
        return `${this.hyperpodDevSpace.name} (${this.hyperpodDevSpace.status})`
    }

    public buildDescription(): string {
        return `${this.hyperpodDevSpace.accessType ?? 'Public'} space`
    }

    public buildTooltip(): string {
        return `**Space:** ${this.devSpace.name}
                \n**Namespace:** ${this.devSpace.namespace}
                \n**Cluster:** ${this.devSpace.cluster}
                \n**Creator:** ${this.devSpace.creator}
                \n**Environment:** ${this.devSpace.environment}`
    }

    public buildIconPath() {
        switch (this.hyperpodDevSpace.appType) {
            case 'jupyterlab': {
                return getIcon('aws-sagemaker-jupyter-lab')
            }
            case 'code-editor': {
                return getIcon('aws-sagemaker-code-editor')
            }
            default: {
                break
            }
        }
    }

    private getContext(): string {
        const status = this.getStatus()
        if (status === 'Stopping' || status === 'Starting') {
            return devSpaceContextValueTransitional
        } else if (status === 'Stopped') {
            return devSpaceContextValueStopped
        } else if (status === 'Running') {
            return devSpaceContextValueRunning
        } else if (status === 'Invalid') {
            return devSpaceContextValueInvalid
        } else {
            return devSpaceContextValueError
        }
    }

    public isPending(): boolean {
        return (
            this.getStatus() !== 'Running' &&
            this.getStatus() !== 'Stopped' &&
            this.getStatus() !== 'Error' &&
            this.getStatus() !== 'Invalid'
        )
    }

    public getStatus(): string {
        return this.status
    }

    public get name(): string {
        return this.hyperpodDevSpace.name
    }

    public get namespace(): string {
        return this.hyperpodDevSpace.namespace
    }

    public get cluster(): string {
        return this.hyperpodDevSpace.cluster
    }

    public get status(): string {
        return this.hyperpodDevSpace.status
    }

    public getParent(): SagemakerHyperpodNode {
        return this.parent
    }

    public getDevSpaceKey(): string {
        return `${this.cluster}-${this.namespace}-${this.name}`
    }

    public async updateWorkspaceStatus() {
        try {
            this.hyperpodDevSpace.status = await this.getParent()
                .getKubectlClient(this.hyperpodCluster.clusterName)
                .getHyperpodSpaceStatus(this.hyperpodDevSpace)
        } catch (error) {
            getLogger().warn(
                '[Hyperpod] Failed to update status for %s: %s',
                this.hyperpodDevSpace.name,
                (error as Error).message
            )
        }
        this.updateWorkspace()
        if (this.isPending()) {
            this.parent.trackPendingNode(this.getDevSpaceKey())
        }
    }

    public async refreshNode() {
        await this.updateWorkspaceStatus()
        await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', this)
    }
}
