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
import { LoadMoreNode } from '../../shared/treeview/nodes/loadMoreNode'
import { ChildNodeLoader, ChildNodePage } from '../../awsexplorer/childNodeLoader'
import { DefaultRedshiftClient } from '../../shared/clients/redshiftClient'
import { ConnectionParams, ConnectionType, RedshiftWarehouseType } from '../models/models'
import { RedshiftNodeConnectionWizard } from '../wizards/connectionWizard'
import { ListDatabasesResponse } from 'aws-sdk/clients/redshiftdata'
import { getIcon } from '../../shared/icons'
import { AWSCommandTreeNode } from '../../shared/treeview/nodes/awsCommandTreeNode'
import { telemetry } from '../../shared/telemetry/telemetry'
import { deleteConnection, getConnectionParamsState, updateConnectionParamsState } from './redshiftState'
import { createLogsConnectionMessage, showConnectionMessage } from '../messageUtils'

export class CreateNotebookNode extends AWSCommandTreeNode {
    constructor(parent: RedshiftWarehouseNode) {
        super(parent, 'Create-Notebook', 'aws.redshift.createNotebookClicked', [parent])
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
    public connectionParams?: ConnectionParams

    constructor(
        public readonly parent: RedshiftNode,
        public readonly redshiftWarehouse: AWSResourceNode,
        public readonly warehouseType: RedshiftWarehouseType
    ) {
        super(redshiftWarehouse.name, vscode.TreeItemCollapsibleState.Collapsed)
        this.tooltip = redshiftWarehouse.name
        this.contextValue = 'awsRedshiftWarehouseNode'
        this.arn = redshiftWarehouse.arn
        this.name = redshiftWarehouse.name
        this.redshiftClient = parent.redshiftClient
        const existingConnectionParams = getConnectionParamsState(this.arn)
        if (existingConnectionParams && existingConnectionParams !== deleteConnection) {
            this.connectionParams = existingConnectionParams as ConnectionParams
            this.iconPath = getIcon('aws-redshift-cluster-connected')
        } else {
            this.iconPath = getIcon('aws-redshift-cluster')
        }
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
        return telemetry.redshift_listDatabases.run(async () => {
            const childNodes: RedshiftDatabaseNode[] = []
            // this.connectionParams cannot null here because loadPage should be called only after the connection wizard runs.
            try {
                const listDatabasesResponse: ListDatabasesResponse = await this.redshiftClient.listDatabases(
                    this.connectionParams!,
                    token
                )

                if (listDatabasesResponse.Databases?.sort()) {
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
                createLogsConnectionMessage(this.redshiftWarehouse.name, error as Error)
                return Promise.reject(error)
            }
        })
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                this.childLoader.clearChildren()
                const existingConnectionParams = getConnectionParamsState(this.arn)
                if (existingConnectionParams && existingConnectionParams === deleteConnection) {
                    // connection is deleted but explorer is not refreshed: return clickToEstablishConnectionNode
                    await updateConnectionParamsState(this.arn, undefined)
                    return this.getClickToEstablishConnectionNode()
                } else if (existingConnectionParams && existingConnectionParams !== deleteConnection) {
                    // valid connectionParams: update the redshiftWarehouseNode
                    this.connectionParams = existingConnectionParams as ConnectionParams
                } else {
                    // No connectionParams: trigger connection wizard to get user input
                    this.connectionParams = await new RedshiftNodeConnectionWizard(this).run()
                    if (!this.connectionParams) {
                        return this.getClickToEstablishConnectionNode()
                    }

                    if (this.connectionParams.connectionType === ConnectionType.DatabaseUser) {
                        const secretArnFetched = await this.redshiftClient.createSecretFromConnectionParams(
                            this.connectionParams
                        )
                        if (!secretArnFetched) {
                            throw new Error('secret arn could not be fetched')
                        }
                        this.connectionParams.secret = secretArnFetched
                    }
                }
                try {
                    const childNodes = await this.childLoader.getChildren()
                    const startButtonNode = new CreateNotebookNode(this)
                    childNodes.unshift(startButtonNode)
                    await updateConnectionParamsState(this.arn, this.connectionParams)
                    return childNodes
                } catch (error) {
                    showConnectionMessage(this.redshiftWarehouse.name, error as Error)
                    await updateConnectionParamsState(this.arn, undefined)
                    return this.getRetryNode()
                }
            },
            getNoChildrenPlaceholderNode: async () => this.getClickToEstablishConnectionNode()[0],
        })
    }

    private getClickToEstablishConnectionNode(): AWSCommandTreeNode[] {
        return [
            new AWSCommandTreeNode(
                this,
                localize('AWS.redshift.clickToEstablishConnection', 'Click to connect'),
                'aws.refreshAwsExplorerNode',
                [this]
            ),
        ]
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
