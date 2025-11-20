/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AppType } from '@aws-sdk/client-sagemaker'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { HyperpodCluster, HyperpodDevSpace } from '../../../shared/clients/kubectlClient'
import { SagemakerHyperpodNode } from './sagemakerHyperpodNode'
import { getIcon } from '../../../shared/icons'
import { getLogger } from '../../../shared/logger/logger'

export const devSpaceContextValueStopped = 'awsSagemakerHyperpodDevSpaceStoppedNode'
export const devSpaceContextValueRunning = 'awsSagemakerHyperpodDevSpaceRunningNode'
export const devSpaceContextValueTransitional = 'awsSagemakerHyperpodDevSpaceTransitionalNode'
export const devSpaceContextValueError = 'awsSagemakerHyperpodDevSpaceErrorNode'

export class SagemakerDevSpaceNode extends AWSTreeNodeBase {
    public constructor(
        public readonly parent: SagemakerHyperpodNode,
        public readonly devSpace: HyperpodDevSpace,
        public readonly hpCluster: HyperpodCluster,
        public override readonly regionCode: string
    ) {
        super('')
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
        return `${this.devSpace.name} (${this.devSpace.status})`
    }

    public buildDescription(): string {
        return `${this.devSpace.accessType ?? 'Public'} space`
    }

    public buildTooltip(): string {
        return `**Space:** ${this.devSpace.name}
                \n**Namespace:** ${this.devSpace.namespace}
                \n**Cluster:** ${this.devSpace.cluster}
                \n**Creator:** ${this.devSpace.creator}
                \n**Environment:** Hyperpod`
    }

    public buildIconPath() {
        switch (this.devSpace.appType) {
            case AppType.JupyterLab: {
                return getIcon('aws-sagemaker-jupyter-lab')
            }
            case AppType.CodeEditor: {
                return getIcon('aws-sagemaker-code-editor')
            }
            default: {
                break
            }
        }
    }

    public getContext(): string {
        if (this.status === 'Stopping' || this.status === 'Starting') {
            return devSpaceContextValueTransitional
        } else if (this.status === 'Stopped') {
            return devSpaceContextValueStopped
        } else if (this.status === 'Running') {
            return devSpaceContextValueRunning
        } else {
            return devSpaceContextValueError
        }
    }

    public isPending(): boolean {
        return (
            this.status !== 'Running' &&
            this.status !== 'Stopped' &&
            this.status !== 'Error' &&
            this.status !== 'Invalid'
        )
    }

    public get status(): string {
        return this.devSpace.status
    }

    public get name(): string {
        return this.devSpace.name
    }

    public get namespace(): string {
        return this.devSpace.namespace
    }

    public get cluster(): string {
        return this.devSpace.cluster
    }

    public getParent(): SagemakerHyperpodNode {
        return this.parent
    }

    public getDevSpaceKey(): string {
        return `${this.cluster}-${this.namespace}-${this.name}`
    }

    public async updateWorkspaceStatus() {
        try {
            const kubectlClient = this.getParent().getKubectlClient(this.hpCluster.clusterName)
            if (!kubectlClient) {
                getLogger().info(`Failed to update workspace status due to unavailable kubectl client`)
                return
            }
            this.devSpace.status = await kubectlClient.getHyperpodSpaceStatus(this.devSpace)
        } catch (error) {
            getLogger().warn(
                '[Hyperpod] Failed to update status for %s: %s',
                this.devSpace.name,
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
