/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { inspect } from 'util'
import { EcrClient } from '../../shared/clients/ecrClient'
import { EcrRepositoryNode } from './ecrRepositoryNode'

/**
 * An AWS Explorer node representing S3.
 *
 * Contains buckets for a specific region as child nodes.
 */
export class EcrNode extends AWSTreeNodeBase {
    public constructor(private readonly ecr: EcrClient) {
        super('ECR', vscode.TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'awsEcrNode'
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                const response = await toArrayAsync(this.ecr.describeRepositories())

                return response.map(item => new EcrRepositoryNode(this, this.ecr, item))
            },
            getErrorNode: async (error: Error) =>
                new ErrorNode(this, error, localize('AWS.explorerNode.ecr.error', 'Error loading ECR resources')),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.ecr.noRepositories', '[No repositories found]')),
            sort: (item1: EcrRepositoryNode, item2: EcrRepositoryNode) =>
                item1.repository.repositoryName.localeCompare(item2.repository.repositoryName),
        })
    }

    public async createRepository(repositoryName: string): Promise<void> {
        await this.ecr.createRepository(repositoryName)
    }

    public [inspect.custom](): string {
        return 'ECRNode'
    }
}
