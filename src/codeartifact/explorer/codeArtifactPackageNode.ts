/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { CodeArtifactRepositoryNode } from './codeArtifactRepositoryNode'
import { CodeArtifactPackageVersionNode } from './codeArtifactPackageVersionNode'
import {
    CodeArtifactClient,
    CodeArtifactDomain,
    CodeArtifactRepository,
    CodeArtifactPackage,
} from '../../shared/clients/codeArtifactClient'

import { makeChildrenNodes } from '../../shared/treeview/utils'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { getIcon } from '../../shared/icons'

export class CodeArtifactPackageNode extends AWSTreeNodeBase implements AWSTreeNodeBase {
    namespace: string = this.artifact.packageNamespace
    name: string = this.artifact.packageName
    format: string = this.artifact.packageFormat
    fullName: string = this.artifact.packageFullName
    public readonly regionCode: string

    constructor(
        public readonly parent: CodeArtifactRepositoryNode,
        private readonly codeArtifact: CodeArtifactClient,
        public readonly domain: CodeArtifactDomain,
        public readonly repository: CodeArtifactRepository,
        public readonly artifact: CodeArtifactPackage
    ) {
        super(artifact.packageFullName, vscode.TreeItemCollapsibleState.Collapsed)
        this.iconPath = getIcon('aws-ecr-registry')
        this.contextValue = 'awsCodeArtifactPackageNode'
        this.regionCode = codeArtifact.regionCode
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                const response = await toArrayAsync(
                    this.codeArtifact.listPackageVersions(
                        this.domain.domainName,
                        this.repository.repositoryName,
                        this.artifact.packageFormat,
                        this.artifact.packageNamespace,
                        this.artifact.packageName
                    )
                )

                return response.map(item => new CodeArtifactPackageVersionNode(this.codeArtifact, item))
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(
                    this,
                    localize('AWS.explorerNode.codeArtifact.noVersions', '[No package versions found]')
                ),
            sort: (item1, item2) => item1.version.versionName.localeCompare(item2.version.versionName),
        })
    }
}
