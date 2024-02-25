/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { EcrClient, EcrRepository } from '../../shared/clients/ecrClient'
import { EcrRepositoryNode } from './ecrRepositoryNode'

export class EcrTagNode extends AWSTreeNodeBase {
    public override readonly regionCode = this.parent.regionCode

    public constructor(
        public readonly parent: EcrRepositoryNode,
        private readonly ecr: EcrClient,
        public readonly repository: EcrRepository,
        public readonly tag: string
    ) {
        super(tag, vscode.TreeItemCollapsibleState.None)
        this.contextValue = 'awsEcrTagNode'
    }

    public async deleteTag(): Promise<void> {
        await this.ecr.deleteTag(this.repository.repositoryName, this.tag)
    }
}
