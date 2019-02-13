/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { Lambda } from 'aws-sdk'
import { Uri } from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase'

export abstract class FunctionNodeBase extends AWSTreeNodeBase {
    public abstract readonly regionCode: string

    protected constructor(
        public configuration: Lambda.FunctionConfiguration
    ) {
        super('')
        this.update(configuration)
        this.iconPath = {
            dark: Uri.file(ext.context.asAbsolutePath('resources/dark/lambda.svg')),
            light: Uri.file(ext.context.asAbsolutePath('resources/light/lambda.svg')),
        }
    }

    public update(configuration: Lambda.FunctionConfiguration): void {
        this.configuration = configuration
        this.label = this.configuration.FunctionName || ''
        this.tooltip = `${this.configuration.FunctionName}-${this.configuration.FunctionArn}`
    }
}
