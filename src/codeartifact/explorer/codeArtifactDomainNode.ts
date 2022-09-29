/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { CodeArtifactNode } from './codeArtifactNode'
import { CodeArtifactClient, CodeArtifactDomain } from '../../shared/clients/codeArtifactClient'

import { makeChildrenNodes } from '../../shared/treeview/utils'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { getIcon } from '../../shared/icons'
import { CodeArtifactRepositoryNode } from './codeArtifactRepositoryNode'

export class CodeArtifactDomainNode extends AWSTreeNodeBase implements AWSResourceNode {
    name: string = this.domain.domainName
    arn: string = this.domain.domainArn
    status: string = this.domain.domainStatus
    public readonly regionCode: string

    constructor(
        public readonly parent: CodeArtifactNode,
        private readonly codeArtifact: CodeArtifactClient,
        public readonly domain: CodeArtifactDomain
    ) {
        super(domain.domainName, vscode.TreeItemCollapsibleState.Collapsed)
        this.iconPath = getIcon('aws-ecr-registry')
        this.contextValue = 'awsCodeArtifactDomainNode'
        this.regionCode = codeArtifact.regionCode
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                const response = await toArrayAsync(this.codeArtifact.listRepositoriesInDomain(this.name))

                return response.map(item => new CodeArtifactRepositoryNode(this, this.codeArtifact, this.domain, item))
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(
                    this,
                    localize('AWS.explorerNode.codeArtifact.noRepositories', '[No repositories found]')
                ),
            sort: (item1, item2) => item1.repository.repositoryName.localeCompare(item2.repository.repositoryName),
        })
    }
}
