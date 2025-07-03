/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lambda } from 'aws-sdk'
import * as os from 'os'
import * as vscode from 'vscode'
import { getIcon } from '../../shared/icons'

import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { editLambdaCommand } from '../commands/editLambda'
import { fs } from '../../shared/fs/fs'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import path from 'path'
import { localize } from 'vscode-nls'
import { LambdaFunctionFolderNode } from './lambdaFunctionFolderNode'
import { LambdaFunctionFileNode } from './lambdaFunctionFileNode'

export const contextValueLambdaFunction = 'awsRegionFunctionNode'
export const contextValueLambdaFunctionImportable = 'awsRegionFunctionNodeDownloadable'

export class LambdaFunctionNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly parent: AWSTreeNodeBase,
        public override readonly regionCode: string,
        public configuration: Lambda.FunctionConfiguration,
        public override readonly contextValue?: string
    ) {
        super(
            `${configuration.FunctionArn}`,
            contextValue === contextValueLambdaFunctionImportable
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        )
        this.update(configuration)
        this.resourceUri = vscode.Uri.from({ scheme: 'lambda', path: `${regionCode}/${configuration.FunctionName}` })
        this.iconPath = getIcon('aws-lambda-function')
        this.contextValue = contextValue
    }

    public update(configuration: Lambda.FunctionConfiguration): void {
        this.configuration = configuration
        this.label = this.configuration.FunctionName || ''
        this.tooltip = `${this.configuration.FunctionName}${os.EOL}${this.configuration.FunctionArn}`
        if (this.contextValue === contextValueLambdaFunction) {
            this.tooltip += `${os.EOL} This function is not downloadable`
        }
    }

    public get functionName(): string {
        return this.configuration.FunctionName || ''
    }

    public get arn(): string {
        if (this.configuration.FunctionArn === undefined) {
            throw new Error('FunctionArn expected but not found')
        }

        return this.configuration.FunctionArn
    }

    public get name(): string {
        if (this.configuration.FunctionName === undefined) {
            throw new Error('FunctionName expected but not found')
        }

        return this.configuration.FunctionName
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        if (!(this.contextValue === contextValueLambdaFunctionImportable)) {
            return []
        }

        return await makeChildrenNodes({
            getChildNodes: async () => {
                const path = await editLambdaCommand(this)
                return path ? this.loadFunctionFiles(path) : []
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.lambda.noFiles', '[No files found]')),
        })
    }

    public async loadFunctionFiles(tmpPath: string): Promise<AWSTreeNodeBase[]> {
        const nodes: AWSTreeNodeBase[] = []
        const files = await fs.readdir(tmpPath)
        for (const file of files) {
            const [fileName, type] = file
            const filePath = path.join(tmpPath, fileName)
            if (type === vscode.FileType.Directory) {
                nodes.push(new LambdaFunctionFolderNode(this, fileName, filePath))
            } else {
                nodes.push(new LambdaFunctionFileNode(this, fileName, filePath))
            }
        }

        return nodes
    }
}
