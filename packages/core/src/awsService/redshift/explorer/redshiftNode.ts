/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// eslint-disable-next-line header/header
import * as vscode from 'vscode'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../../shared/treeview/utils'
import { inspect } from 'util'
import { DefaultRedshiftClient } from '../../../shared/clients/redshiftClient'
import { RedshiftWarehouseNode } from './redshiftWarehouseNode'
import { RedshiftWarehouseType } from '../models/models'
import { AWSResourceNode } from '../../../shared/treeview/nodes/awsResourceNode'
import { LoadMoreNode } from '../../../shared/treeview/nodes/loadMoreNode'
import { ChildNodeLoader, ChildNodePage } from '../../../awsexplorer/childNodeLoader'
import { getLogger } from '../../../shared/logger/logger'

/**
 * An AWS Explorer node representing Redshift.
 *
 * Contains clusters for a specific region as child nodes.
 */
export class RedshiftNode extends AWSTreeNodeBase implements LoadMoreNode {
    private readonly childLoader = new ChildNodeLoader(this, (token) => this.loadPage(token))

    // the constructor below single parameter : 'redshiftClient' which is an instance of the DefaultRedshiftClient used for interacting with Redshift services.
    public constructor(public readonly redshiftClient: DefaultRedshiftClient) {
        super('Redshift', vscode.TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'awsRedshiftNode'
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

    /**
     * Loads a page of provisioned clusters and serverless workgroups
     * There are four cases:
     * 1. @param token is undefined -> this is only for the first load use-case, then loads both provisioned clusters and serverless workgroups
     * 2. @param token is defined but one of the underlying tokens is empty string -> loads the next page for the non-empty one.
     * 3. @param token is defined but both of the underlying tokens are empty string (this is not a real case since we handle this at the end)
     * 4. @param token is defined and none of the underlying tokens are empty -> loads both
     * @param token compositeContinuationToken (@link: CompositeContinuationToken) stringified
     * @returns
     */
    private async loadPage(token?: string): Promise<ChildNodePage<RedshiftWarehouseNode>> {
        let newProvisionedToken: string
        let newServerlessToken: string
        let newChildrenNodes: RedshiftWarehouseNode[] = []
        if (token) {
            const compositeContinuationToken = JSON.parse(token) as CompositeContinuationToken
            ;[newChildrenNodes, newProvisionedToken, newServerlessToken] =
                await this.loadNodes(compositeContinuationToken)
        } else {
            ;[newChildrenNodes, newProvisionedToken, newServerlessToken] = await this.loadNodes(undefined)
        }

        // This check is needed since ChildNodeLoader will continue to show the Load more button if the newContinuationToken is not undefined
        if (newProvisionedToken === '' && newServerlessToken === '') {
            return {
                newChildren: newChildrenNodes,
                newContinuationToken: undefined,
            }
        } else {
            return {
                newChildren: newChildrenNodes,
                newContinuationToken: JSON.stringify({
                    provisionedToken: newProvisionedToken,
                    serverlessToken: newServerlessToken,
                }),
            }
        }
    }

    private async loadNodes(
        compositeContinuationToken: CompositeContinuationToken | undefined
    ): Promise<[RedshiftWarehouseNode[], string, string]> {
        const childNodes: RedshiftWarehouseNode[] = []
        let newServerlessToken: string = ''
        let newProvisionedToken: string = ''
        // Handle provisioned clusters
        if (compositeContinuationToken === undefined || compositeContinuationToken.provisionedToken !== '') {
            const response = await this.redshiftClient.describeProvisionedClusters(
                compositeContinuationToken?.provisionedToken
            )
            if (response.Clusters) {
                const provisionedNodes = response.Clusters.map((cluster) => {
                    return new RedshiftWarehouseNode(
                        this,
                        {
                            arn: cluster.ClusterNamespaceArn,
                            name: cluster.ClusterIdentifier,
                        } as AWSResourceNode,
                        RedshiftWarehouseType.PROVISIONED
                    )
                })
                childNodes.push(...provisionedNodes)
                newProvisionedToken = response.Marker ?? ''
            }
        }
        // Handle serverless workgroups
        if (compositeContinuationToken === undefined || compositeContinuationToken.serverlessToken !== '') {
            try {
                const response = await this.redshiftClient.listServerlessWorkgroups(
                    compositeContinuationToken?.serverlessToken
                )
                if (response.workgroups) {
                    const serverlessNodes = response.workgroups.map((workgroup) => {
                        return new RedshiftWarehouseNode(
                            this,
                            { arn: workgroup.workgroupArn, name: workgroup.workgroupName } as AWSResourceNode,
                            RedshiftWarehouseType.SERVERLESS
                        )
                    })
                    childNodes.push(...serverlessNodes)
                    newServerlessToken = response.nextToken ?? ''
                }
            } catch (error) {
                getLogger().error("Serverless workgroup operation isn't supported or failed: %O", error)
                // Continue without interrupting the provisioned cluster loading
            }
        }
        return [childNodes, newProvisionedToken, newServerlessToken]
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => this.childLoader.getChildren(),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.redshiftClient.noClusters', 'No cluster found')),
        })
    }

    public async createCluster(clusterName: string): Promise<void> {
        // Code for creating redshiftClient cluster
    }

    public [inspect.custom](): string {
        return 'RedshiftNode'
    }
}

interface CompositeContinuationToken {
    provisionedToken: string
    serverlessToken: string
}
