/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { EcrNode } from './ecrNode'
import { EcrClient, EcrRepository } from '../../shared/clients/ecrClient'

import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { EcrTagNode } from './ecrTagNode'
import globals from '../../shared/extensionGlobals'

export class EcrRepositoryNode extends AWSTreeNodeBase implements AWSResourceNode {
    name: string = this.repository.repositoryName
    arn: string = this.repository.repositoryArn
    public readonly regionCode: string

    constructor(
        public readonly parent: EcrNode,
        private readonly ecr: EcrClient,
        public readonly repository: EcrRepository
    ) {
        super(repository.repositoryName, vscode.TreeItemCollapsibleState.Collapsed)
        this.iconPath = {
            dark: vscode.Uri.file(globals.iconPaths.dark.ecr),
            light: vscode.Uri.file(globals.iconPaths.light.ecr),
        }
        this.contextValue = 'awsEcrRepositoryNode'
        this.regionCode = ecr.regionCode
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                const response = await toArrayAsync(this.ecr.describeTags(this.repository.repositoryName))

                return response.map(item => new EcrTagNode(this, this.ecr, this.repository, item))
            },
            getErrorNode: async (error: Error, logID: number) => new ErrorNode(this, error, logID),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.ecr.noTags', '[No tags found]')),
            sort: (item1, item2) => item1.tag.localeCompare(item2.tag),
        })
    }

    public async deleteRepository(): Promise<void> {
        await this.ecr.deleteRepository(this.repository.repositoryName)
    }
}
