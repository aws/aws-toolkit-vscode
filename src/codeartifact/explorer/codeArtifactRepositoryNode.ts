/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { CodeArtifactDomainNode } from './codeArtifactDomainNode'
import { CodeArtifactClient, CodeArtifactDomain, CodeArtifactRepository } from '../../shared/clients/codeArtifactClient'

import { makeChildrenNodes } from '../../shared/treeview/utils'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { CodeArtifactPackageNode } from './codeArtifactPackageNode'
import { getIcon } from '../../shared/icons'

export class CodeArtifactRepositoryNode extends AWSTreeNodeBase implements AWSResourceNode {
    name: string = this.repository.repositoryName
    arn: string = this.repository.repositoryArn
    public readonly regionCode: string

    constructor(
        public readonly parent: CodeArtifactDomainNode,
        private readonly codeArtifact: CodeArtifactClient,
        public readonly domain: CodeArtifactDomain,
        public readonly repository: CodeArtifactRepository
    ) {
        super(repository.repositoryName, vscode.TreeItemCollapsibleState.Collapsed)
        this.iconPath = getIcon('aws-ecr-registry')
        this.contextValue = 'awsCodeArtifactRepositoryNode'
        this.regionCode = codeArtifact.regionCode
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                const response = await toArrayAsync(
                    this.codeArtifact.listPackages(this.domain.domainName, this.repository.repositoryName)
                )

                return response.map(
                    item => new CodeArtifactPackageNode(this, this.codeArtifact, this.domain, this.repository, item)
                )
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.codeArtifact.noPackages', '[No packages found]')),
            sort: (item1, item2) => item1.artifact.packageFullName.localeCompare(item2.artifact.packageFullName),
        })
    }
}
