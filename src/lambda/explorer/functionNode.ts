/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import Lambda = require('aws-sdk/clients/lambda')
import { ThemeIcon, TreeItem, Uri } from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase'

export class FunctionNode extends AWSTreeNodeBase implements TreeItem {
    public static contextValue: string = 'awsLambdaFn'
    public contextValue: string = FunctionNode.contextValue

    public label?: string
    public tooltip?: string
    public iconPath?: { light: Uri; dark: Uri }

    public constructor(
        public readonly functionConfiguration: Lambda.FunctionConfiguration,
        public readonly lambda: Lambda
    ) {
        super()
        this.label = `${this.functionConfiguration.FunctionName!}`
        this.tooltip = `${this.functionConfiguration.FunctionName}-${this.functionConfiguration.FunctionArn}`
        this.iconPath = {
            dark: Uri.file(ext.context.asAbsolutePath('resources/dark/lambda_function.svg')),
            light: Uri.file(ext.context.asAbsolutePath('resources/light/lambda_function.svg'))
        }
    }

    public getChildren(): Thenable<AWSTreeNodeBase[]> {
        return new Promise(resolve => resolve([]))
    }

    public getTreeItem(): TreeItem {
        return this
    }
}
