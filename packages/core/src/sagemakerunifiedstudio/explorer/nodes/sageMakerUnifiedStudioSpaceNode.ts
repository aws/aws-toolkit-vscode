/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SagemakerClient, SagemakerSpaceApp } from '../../../shared/clients/sagemaker'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { SageMakerUnifiedStudioSpacesParentNode } from './sageMakerUnifiedStudioSpacesParentNode'
import { SagemakerSpace } from '../../../awsService/sagemaker/sagemakerSpace'

export class SagemakerUnifiedStudioSpaceNode implements TreeNode {
    private smSpace: SagemakerSpace
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeTreeItem = this.onDidChangeEmitter.event
    public readonly onDidChangeChildren = this.onDidChangeEmitter.event

    public constructor(
        private readonly parent: SageMakerUnifiedStudioSpacesParentNode,
        public readonly sageMakerClient: SagemakerClient,
        public readonly regionCode: string,
        public readonly spaceApp: SagemakerSpaceApp,
        isSMUSSpace: boolean
    ) {
        this.smSpace = new SagemakerSpace(this.sageMakerClient, this.regionCode, this.spaceApp, isSMUSSpace)
    }

    public getTreeItem(): vscode.TreeItem {
        return {
            label: this.smSpace.label,
            description: this.smSpace.description,
            tooltip: this.smSpace.tooltip,
            iconPath: this.smSpace.iconPath,
            contextValue: this.smSpace.contextValue,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
        }
    }

    public getChildren(): TreeNode[] {
        return []
    }

    public getParent(): TreeNode | undefined {
        return this.parent
    }

    public async refreshNode(): Promise<void> {
        this.onDidChangeEmitter.fire()
    }

    public get id(): string {
        return 'smusSpaceNode' + this.name
    }

    public get resource() {
        return this
    }

    // Delegate all core functionality to SageMakerSpace instance
    public updateSpace(spaceApp: SagemakerSpaceApp) {
        this.smSpace.updateSpace(spaceApp)
        if (this.isPending()) {
            this.parent.trackPendingNode(this.DomainSpaceKey)
        }
    }

    public setSpaceStatus(spaceStatus: string, appStatus: string) {
        this.smSpace.setSpaceStatus(spaceStatus, appStatus)
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

        if (this.isPending()) {
            this.parent.trackPendingNode(this.DomainSpaceKey)
        }
        return
    }
    public buildTooltip() {
        return this.smSpace.buildTooltip()
    }
    public getAppIcon() {
        return this.smSpace.getAppIcon()
    }
    public get DomainSpaceKey(): string {
        return this.smSpace.DomainSpaceKey
    }
}
