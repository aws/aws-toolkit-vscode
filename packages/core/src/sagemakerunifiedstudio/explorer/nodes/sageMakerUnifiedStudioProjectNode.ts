/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { getLogger } from '../../../shared/logger/logger'
import { DataZoneProject } from '../../shared/client/datazoneClient'
import { SageMakerUnifiedStudioDataNode } from './sageMakerUnifiedStudioDataNode'
import { telemetry } from '../../../shared/telemetry/telemetry'

/**
 * Tree node representing a SageMaker Unified Studio project
 */
export class SageMakerUnifiedStudioProjectNode implements TreeNode {
    private readonly logger = getLogger()

    public readonly id = 'smusProjectNode'
    public readonly resource = this
    private project?: DataZoneProject
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeTreeItem = this.onDidChangeEmitter.event

    constructor() {}

    public async getTreeItem(): Promise<vscode.TreeItem> {
        if (this.project) {
            const item = new vscode.TreeItem(this.project.name, vscode.TreeItemCollapsibleState.Collapsed)
            item.contextValue = 'smusSelectedProject'
            item.tooltip = `Project: ${this.project.name}\nID: ${this.project.id}`
            return item
        }
        const item = new vscode.TreeItem('Select a project', vscode.TreeItemCollapsibleState.None)
        item.contextValue = 'smusProjectSelectPicker'
        item.command = {
            command: 'aws.smus.projectView',
            title: 'Select Project',
            arguments: [this],
        }
        return item
    }

    public async getChildren(): Promise<TreeNode[]> {
        if (!this.project) {
            return []
        }
        try {
            void vscode.window.showInformationMessage(`Selected project: ${this.project.name}.`)

            telemetry.record({
                name: 'smus_selectProject',
                result: 'Succeeded',
                passive: false,
            })
        } catch (err) {
            void vscode.window.showErrorMessage(
                `SageMaker Unifed Studio: Failed to select project: ${(err as Error).message}`
            )
            this.logger.error('Failed to select project: %s', (err as Error).message)
        }

        // Create a Data folder node that will load connections on demand
        const dataNode = new SageMakerUnifiedStudioDataNode(this)
        return [dataNode]
    }

    public getParent(): TreeNode | undefined {
        return undefined
    }

    public async setProject(project: any): Promise<void> {
        this.project = project

        // Fire the event to refresh this node and its children
        this.onDidChangeEmitter.fire()
    }

    public getProject(): DataZoneProject | undefined {
        return this.project
    }
}
