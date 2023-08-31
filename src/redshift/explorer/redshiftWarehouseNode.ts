/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import * as vscode from 'vscode'
import { RedshiftNode } from './redshiftNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { RedshiftDatabaseNode } from './redshiftDatabaseNode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { LoadMoreNode } from '../../shared/treeview/nodes/loadMoreNode'
import { ChildNodeLoader, ChildNodePage } from '../../awsexplorer/childNodeLoader'
import { DefaultRedshiftClient } from '../../shared/clients/redshiftClient'
import { ConnectionParams, RedshiftWarehouseType } from '../models/models'
import { RedshiftNodeConnectionWizard } from '../wizards/connectionWizard'
import { ListDatabasesResponse } from 'aws-sdk/clients/redshiftdata'
import { getIcon } from '../../shared/icons'
import { AWSCommandTreeNode } from '../../shared/treeview/nodes/awsCommandTreeNode'
import { getLogger } from '../../shared/logger'
import { telemetry } from '../../shared/telemetry/telemetry'

export class StartButtonNode extends AWSCommandTreeNode {
    constructor(parent: RedshiftWarehouseNode) {
        super(parent, 'Create-Notebook', 'aws.redshift.startButtonClicked', [parent])
        this.iconPath = getIcon('vscode-debug-start')
    }
    toJSON() {
        // Exclude the 'redshiftWarehouse' property from serialization
        return { ...this, parent: undefined }
    }
}

export class RedshiftWarehouseNode extends AWSTreeNodeBase implements AWSResourceNode, LoadMoreNode {
    private readonly childLoader = new ChildNodeLoader(this, token => this.loadPage(token))
    public arn: string
    public name: string
    public redshiftClient: DefaultRedshiftClient
    public connectionParams: ConnectionParams | undefined
    public newStartButton: { label: string; iconPath: any }
    private readonly logger = getLogger()

    constructor(
        public readonly parent: RedshiftNode,
        public readonly redshiftWarehouse: AWSResourceNode,
        public readonly warehouseType: RedshiftWarehouseType,
        public readonly connectionWizard?: RedshiftNodeConnectionWizard
    ) {
        super(redshiftWarehouse.name, vscode.TreeItemCollapsibleState.Collapsed)
        this.tooltip = redshiftWarehouse.name
        this.iconPath = getIcon('aws-redshift-cluster')
        this.contextValue = 'awsRedshiftWarehouseNode'
        this.arn = redshiftWarehouse.arn
        this.name = redshiftWarehouse.name
        this.redshiftClient = parent.redshiftClient
        this.newStartButton = { label: 'Start', iconPath: getIcon('vscode-debug-start') }
        this.connectionWizard = connectionWizard ?? new RedshiftNodeConnectionWizard(this)
    }

    public setConnectionParams(connectionParams: ConnectionParams) {
        this.connectionParams = connectionParams
    }

    public async loadMoreChildren(): Promise<void> {
        await this.childLoader.loadMoreChildren()
    }

    public isLoadingMoreChildren(): boolean {
        return this.childLoader.isLoadingMoreChildren()
    }

    public clearChildren(): void {
        this.childLoader.clearChildren()
    }

    private async loadPage(token?: string): Promise<ChildNodePage<AWSTreeNodeBase>> {
        const childNodes: RedshiftDatabaseNode[] = []
        // this.connectionParams cannot null here because loadPage should be called only after the connection wizard runs.
        try {
            const listDatabasesResponse: ListDatabasesResponse = await this.redshiftClient.listDatabases(
                this.connectionParams!,
                token
            )
            if (listDatabasesResponse.Databases) {
                childNodes.push(
                    ...listDatabasesResponse.Databases.map(db => {
                        return new RedshiftDatabaseNode(db, this.redshiftClient, this.connectionParams!)
                    })
                )
            }

            return {
                newContinuationToken: listDatabasesResponse.NextToken,
                newChildren: childNodes,
            }
        } catch (error) {
            this.logger.error(`Failed to fetch databases for warehouse ${this.redshiftWarehouse.name} - ${error}`)
            return Promise.reject(error)
        } finally {
            telemetry.redshift_listingAPI.emit()
        }
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                this.childLoader.clearChildren()
                const connectionParams = await this.connectionWizard!.run()
                if (!connectionParams) {
                    return this.getRetryNode()
                } else {
                    this.connectionParams = connectionParams
                    try {
                        const childNodes = await this.childLoader.getChildren()
                        //Add the startButton
                        const startButtonNode = new StartButtonNode(this)
                        childNodes.unshift(startButtonNode)
                        return childNodes
                    } catch {
                        return this.getRetryNode()
                    }
                }
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(
                    this,
                    localize('AWS.explorerNode.redshiftClient.noDatabases', 'No databases found')
                ),
        })
    }

    private getRetryNode(): AWSCommandTreeNode[] {
        return [
            new AWSCommandTreeNode(
                this,
                localize('AWS.redshift.connectionError.retry', 'Unable to get databases, click here to retry'),
                'aws.refreshAwsExplorerNode',
                [this]
            ),
        ]
    }

    toJSON() {
        // Exclude the 'redshiftWarehouse' property from serialization
        return { ...this, redshiftWarehouse: undefined }
    }
}
