/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { getIcon } from '../../../shared/icons'
import { getLogger } from '../../../shared/logger/logger'
import { DataZoneClient, DataZoneProject } from '../../shared/client/datazoneClient'
import { telemetry } from '../../../shared/telemetry/telemetry'

const contextValueSmusProject = 'sageMakerUnifiedStudioProject'

/**
 * Tree node representing a SageMaker Unified Studio project
 */
export class SageMakerUnifiedStudioProjectNode implements TreeNode {
    public readonly resource = this.project
    private readonly logger = getLogger()

    constructor(
        public readonly id: string,
        private readonly project: DataZoneProject
    ) {}

    public async getChildren(): Promise<TreeNode[]> {
        try {
            const datazoneClient = DataZoneClient.getInstance()

            // Get tooling environment credentials for the selected project
            try {
                this.logger.info(`Getting tooling environment credentials for project ${this.project.id}`)
                const envCreds = await datazoneClient.getProjectDefaultEnvironmentCreds(
                    this.project.domainId,
                    this.project.id
                )

                if (envCreds?.accessKeyId && envCreds?.secretAccessKey) {
                    this.logger.info('Successfully obtained tooling environment credentials')
                } else {
                    this.logger.warn('Tooling environment credentials are incomplete or missing')
                }
            } catch (credsErr) {
                this.logger.error(`Failed to get tooling environment credentials: ${(credsErr as Error).message}`)
            }

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

        return [
            {
                id: 'sageMakerUnifiedStudioProjectChild',
                resource: {},
                getTreeItem: () => {
                    const item = new vscode.TreeItem('Placeholder tree node', vscode.TreeItemCollapsibleState.None)
                    item.label = 'Placeholder tree node'
                    return item
                },
                getParent: () => this,
            },
        ]
    }

    public getTreeItem(): vscode.TreeItem {
        const displayName = this.project.name
        const item = new vscode.TreeItem(displayName, vscode.TreeItemCollapsibleState.Collapsed)

        item.iconPath = getIcon('vscode-folder')
        item.contextValue = contextValueSmusProject

        return item
    }

    public getParent(): TreeNode | undefined {
        return undefined
    }
}
