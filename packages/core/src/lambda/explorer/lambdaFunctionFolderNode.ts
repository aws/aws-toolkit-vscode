/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { LambdaFunctionNode } from './lambdaFunctionNode'
import { fs } from '../../shared/fs/fs'
import { getIcon } from '../../shared/icons'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { localize } from 'vscode-nls'
import path from 'path'
import { LambdaFunctionFileNode } from './lambdaFunctionFileNode'

export class LambdaFunctionFolderNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly parent: LambdaFunctionNode | LambdaFunctionFolderNode,
        public readonly filename: string,
        public readonly path: string
    ) {
        super(filename, vscode.TreeItemCollapsibleState.Collapsed)
        this.iconPath = getIcon('vscode-folder')
        this.contextValue = 'lambdaFunctionFolderNode'
    }

    public get arn(): string {
        return ''
    }

    public get name(): string {
        return ''
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => this.loadFunctionFiles(),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.s3.noObjects', '[No Objects found]')),
        })
    }

    public async loadFunctionFiles(): Promise<AWSTreeNodeBase[]> {
        const nodes: AWSTreeNodeBase[] = []
        const files = await fs.readdir(this.path)
        for (const file of files) {
            const [fileName, type] = file
            const filePath = path.join(this.path, fileName)
            if (type === vscode.FileType.Directory) {
                nodes.push(new LambdaFunctionFolderNode(this, fileName, filePath))
            } else {
                nodes.push(new LambdaFunctionFileNode(this, fileName, filePath))
            }
        }

        return nodes
    }
}
