/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { LambdaFunctionNode } from './lambdaFunctionNode'
import { getIcon } from '../../shared/icons'
import { isCloud9 } from '../../shared/extensionUtilities'
import { LambdaFunctionFolderNode } from './lambdaFunctionFolderNode'

export class LambdaFunctionFileNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly parent: LambdaFunctionNode | LambdaFunctionFolderNode,
        public readonly filename: string,
        public readonly path: string
    ) {
        super(filename)
        this.iconPath = getIcon('vscode-file')
        this.contextValue = 'lambdaFunctionFileNode'
        this.command = !isCloud9()
            ? {
                  command: 'aws.openLambdaFile',
                  title: 'Open file',
                  arguments: [path],
              }
            : undefined
    }

    public get arn(): string {
        return ''
    }

    public get name(): string {
        return ''
    }
}
