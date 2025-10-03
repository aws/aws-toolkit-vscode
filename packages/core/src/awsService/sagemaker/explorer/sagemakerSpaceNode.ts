/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SagemakerClient, SagemakerSpaceApp } from '../../../shared/clients/sagemaker'
import { AWSResourceNode } from '../../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { SagemakerParentNode } from './sagemakerParentNode'
import { getLogger } from '../../../shared/logger/logger'
import { SagemakerUnifiedStudioSpaceNode } from '../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioSpaceNode'
import { SagemakerSpace } from '../sagemakerSpace'

export class SagemakerSpaceNode extends AWSTreeNodeBase implements AWSResourceNode {
    private smSpace: SagemakerSpace
    public constructor(
        public readonly parent: SagemakerParentNode,
        public readonly client: SagemakerClient,
        public override readonly regionCode: string,
        public readonly spaceApp: SagemakerSpaceApp
    ) {
        super('')
        this.smSpace = new SagemakerSpace(this.client, this.regionCode, this.spaceApp)
        this.updateSpace(spaceApp)
        this.contextValue = this.smSpace.getContext()
    }

    public updateSpace(spaceApp: SagemakerSpaceApp) {
        this.smSpace.updateSpace(spaceApp)
        this.updateFromSpace()
        if (this.isPending()) {
            this.parent.trackPendingNode(this.DomainSpaceKey)
        }
    }

    private updateFromSpace() {
        this.label = this.smSpace.label
        this.description = this.smSpace.description
        this.tooltip = this.smSpace.tooltip
        this.iconPath = this.smSpace.iconPath
        this.contextValue = this.smSpace.contextValue
    }

    public isPending(): boolean {
        return this.smSpace.isPending()
    }

    public getStatus(): string {
        return this.smSpace.getStatus()
    }

    public async getAppStatus() {
        return this.smSpace.getAppStatus()
    }

    public get name(): string {
        return this.smSpace.name
    }

    public get arn(): string {
        return this.smSpace.arn
    }

    public async getAppArn() {
        return this.smSpace.getAppArn()
    }

    public async getSpaceArn() {
        return this.smSpace.getSpaceArn()
    }

    public async updateSpaceAppStatus() {
        await this.smSpace.updateSpaceAppStatus()
        this.updateFromSpace()
        if (this.isPending()) {
            this.parent.trackPendingNode(this.DomainSpaceKey)
        }
    }

    public get DomainSpaceKey(): string {
        return this.spaceApp.DomainSpaceKey!
    }

    public async refreshNode(): Promise<void> {
        await this.updateSpaceAppStatus()
        await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', this)
    }
}

export async function tryRefreshNode(node?: SagemakerSpaceNode | SagemakerUnifiedStudioSpaceNode) {
    if (node) {
        try {
            // For SageMaker spaces, refresh just the individual space node to avoid expensive
            // operation of refreshing all spaces in the domain
            await node.updateSpaceAppStatus()
            node instanceof SagemakerSpaceNode
                ? await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', node)
                : await node.refreshNode()
        } catch (e) {
            getLogger().error('refreshNode failed: %s', (e as Error).message)
        }
    }
}
