/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { Uri } from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase'
import { FunctionInfo } from '../functionInfo'

export abstract class FunctionNodeBase extends AWSTreeNodeBase {
    protected constructor(
        parent: AWSTreeNodeBase | undefined,
        public readonly info: FunctionInfo
    ) {
        super(parent, info.configuration.FunctionName || '')
        this.tooltip = `${info.configuration.FunctionName}-${info.configuration.FunctionArn}`
        this.iconPath =  {
            dark: Uri.file(ext.context.asAbsolutePath('resources/dark/lambda_function.svg')),
            light: Uri.file(ext.context.asAbsolutePath('resources/light/lambda_function.svg'))
        }
    }
}

export class RegionFunctionNode extends FunctionNodeBase {
    public constructor(parent: AWSTreeNodeBase | undefined, info: FunctionInfo) {
        super(parent, info)
        this.contextValue = 'awsRegionFunctionNode'
    }
}

export class CloudFormationFunctionNode extends FunctionNodeBase {
    public constructor(parent: AWSTreeNodeBase | undefined, info: FunctionInfo) {
        super(parent, info)
        this.contextValue = 'awsCloudFormationFunctionNode'
    }
}
