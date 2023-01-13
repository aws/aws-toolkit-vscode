/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lambda } from 'aws-sdk'
import * as os from 'os'
import { getIcon } from '../../shared/icons'

import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { samLambdaImportableRuntimes } from '../models/samLambdaRuntime'

export const contextLambda = 'awsRegionFunctionNode'
export const contextLambdaImportable = 'awsRegionFunctionNodeDownloadable'
export const contextLambdaUploadable = 'awsRegionFunctionNodeUploadable'
export const contextLambdaImportableUploadable = 'awsRegionFunctionNodeDownloadableUploadable'

export class LambdaFunctionNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly parent: AWSTreeNodeBase,
        public readonly regionCode: string,
        public configuration: Lambda.FunctionConfiguration
    ) {
        super('')
        this.update(configuration)
        this.iconPath = getIcon('aws-lambda-function')
    }

    public update(configuration: Lambda.FunctionConfiguration): void {
        this.configuration = configuration
        this.label = this.configuration.FunctionName || ''
        this.tooltip = `${this.configuration.FunctionName}${os.EOL}${this.configuration.FunctionArn}`

        if (samLambdaImportableRuntimes.contains(this.configuration.Runtime ?? '')) {
            this.contextValue =
                this.configuration.PackageType !== 'Image' ? contextLambdaImportableUploadable : contextLambdaImportable
        } else {
            this.contextValue = this.configuration.PackageType !== 'Image' ? contextLambdaUploadable : contextLambda
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
}
