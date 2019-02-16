/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { Lambda } from 'aws-sdk'
import * as os from 'os'
import { Uri } from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase'

export abstract class FunctionNodeBase extends AWSTreeNodeBase {
    public abstract readonly regionCode: string

    protected constructor(
        public configuration: Lambda.FunctionConfiguration,
        public readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string
    ) {
        super('')
        this.update(configuration)
        this.iconPath = {
            dark: Uri.file(this.getExtensionAbsolutePath('resources/dark/lambda.svg')),
            light: Uri.file(this.getExtensionAbsolutePath('resources/light/lambda.svg')),
        }
    }

    public update(configuration: Lambda.FunctionConfiguration): void {
        this.configuration = configuration
        this.label = this.configuration.FunctionName || ''
        this.tooltip = `${this.configuration.FunctionName}${os.EOL}${this.configuration.FunctionArn}`
    }
}
