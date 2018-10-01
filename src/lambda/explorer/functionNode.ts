/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import Lambda = require('aws-sdk/clients/lambda')
import * as path from 'path'
import { ThemeIcon, TreeItem, Uri } from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase'

export class FunctionNode extends AWSTreeNodeBase implements TreeItem {
    public static contextValue: string = 'awsLambdaFn'
    public contextValue: string = FunctionNode.contextValue

    public label?: string
    public tooltip?: string
    public iconPath?: string | Uri | { light: string | Uri; dark: string | Uri } | ThemeIcon

    public constructor(
        public readonly functionConfiguration: Lambda.FunctionConfiguration,
        public readonly lambda: Lambda
    ) {
        super()
        this.label = `${this.functionConfiguration.FunctionName!}`
        this.tooltip = `${this.functionConfiguration.FunctionName}-${this.functionConfiguration.FunctionArn}`
        this.iconPath = {
            light: path.join(__filename, '..', '..', '..', 'resources', 'light', 'lambda_function.svg'),
            dark: path.join(__filename, '..', '..', '..', 'resources', 'dark', 'lambda_function.svg')
        }
    }

    public getChildren(): Thenable<AWSTreeNodeBase[]> {
        return new Promise(resolve => resolve([]))
    }

    public getTreeItem(): TreeItem {
        return this
    }
}
