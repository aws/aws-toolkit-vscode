/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { inspect } from 'util'
import { CodeArtifactClient } from '../../shared/clients/codeArtifactClient'
import { CodeArtifactDomainNode } from './codeArtifactDomainNode'

/**
 * An AWS Explorer node representing CodeArtifact.
 *
 * Contains buckets for a specific region as child nodes.
 */
export class CodeArtifactNode extends AWSTreeNodeBase {
    public constructor(private readonly codeArtifact: CodeArtifactClient) {
        super('CodeArtifact', vscode.TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'awsCodeArtifactNode'
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                const response = await toArrayAsync(this.codeArtifact.listDomains())

                return response.map(item => new CodeArtifactDomainNode(this, this.codeArtifact, item))
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.codeArtifact.noDomains', '[No domains found]')),
            sort: (item1, item2) => item1.domain.domainName.localeCompare(item2.domain.domainName),
        })
    }

    public [inspect.custom](): string {
        return 'CodeArtifactNode'
    }
}
