/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
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

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                const response = await toArrayAsync(this.ecr.describeRepositories())

                return response.map(item => new EcrRepositoryNode(this, this.ecr, item))
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.ecr.noRepositories', '[No repositories found]')),
            sort: (item1, item2) => item1.repository.repositoryName.localeCompare(item2.repository.repositoryName),
        })
    }

    public async createRepository(repositoryName: string): Promise<void> {
        await this.ecr.createRepository(repositoryName)
    }

    public [inspect.custom](): string {
        return 'ECRNode'
    }
}
