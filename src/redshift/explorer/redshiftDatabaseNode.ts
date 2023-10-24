/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { DefaultRedshiftClient } from '../../shared/clients/redshiftClient'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { RedshiftSchemaNode } from './redshiftSchemaNode'
import { ConnectionParams } from '../models/models'
import { LoadMoreNode } from '../../shared/treeview/nodes/loadMoreNode'
import { ChildNodeLoader, ChildNodePage } from '../../awsexplorer/childNodeLoader'
import { getIcon } from '../../shared/icons'
import { telemetry } from '../../shared/telemetry/telemetry'
import { showViewLogsFetchMessage } from '../messageUtils'

export class RedshiftDatabaseNode extends AWSTreeNodeBase implements LoadMoreNode {
    private readonly childLoader = new ChildNodeLoader(this, token => this.loadPage(token))

    public constructor(
        public readonly databaseName: string,
        private readonly redshiftClient: DefaultRedshiftClient,
        private readonly connectionParams: ConnectionParams
    ) {
        super(databaseName, vscode.TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'awsReshiftDatabaseNode'
        this.tooltip = databaseName
        this.iconPath = getIcon('aws-redshift-database')
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

    private async loadPage(token?: string): Promise<ChildNodePage<RedshiftSchemaNode>> {
        return telemetry.redshift_listSchemas.run(async () => {
            const newChildren: RedshiftSchemaNode[] = []
            try {
                // this ensures that when listing schemas (thereafter, when we list tables) we maintain the database name for which we're listing schemas/tables.
                if (this.connectionParams.database !== this.databaseName) {
                    this.connectionParams.database = this.databaseName
                }
                const listSchemaResponse = await this.redshiftClient.listSchemas(this.connectionParams, token)
                if (listSchemaResponse.Schemas?.sort()) {
                    newChildren.push(
                        ...listSchemaResponse.Schemas.map(schema => {
                            return new RedshiftSchemaNode(schema, this.redshiftClient, this.connectionParams)
                        })
                    )
                }
                return {
                    newChildren: newChildren,
                    newContinuationToken: listSchemaResponse.NextToken,
                }
            } catch (error) {
                showViewLogsFetchMessage('schemas', this.databaseName, error as Error)
                return Promise.reject(error)
            }
        })
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => this.childLoader.getChildren(),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.redshiftClient.noSchemas', 'No schemas found')),
        })
    }
}
