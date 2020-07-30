/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lambda } from 'aws-sdk'
import * as os from 'os'
import { Uri } from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'

export class LambdaFunctionNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly parent: AWSTreeNodeBase,
        public readonly regionCode: string,
        public configuration: Lambda.FunctionConfiguration
    ) {
        super('')
        this.update(configuration)
        this.iconPath = {
            dark: Uri.file(ext.iconPaths.dark.lambda),
            light: Uri.file(ext.iconPaths.light.lambda),
        }
    }

    public update(configuration: Lambda.FunctionConfiguration): void {
        this.configuration = configuration
        this.label = this.configuration.FunctionName || ''
        this.tooltip = `${this.configuration.FunctionName}${os.EOL}${this.configuration.FunctionArn}`
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
}
