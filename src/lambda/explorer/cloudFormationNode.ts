/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import CloudFormation = require('aws-sdk/clients/cloudformation')

import { TreeItemCollapsibleState, Uri } from 'vscode'

import { ext } from '../../shared/extensionGlobals'
import { AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase'
import { FunctionInfo } from '../functionInfo'
import { CloudFormationFunctionNode } from './functionNode'
import { PlaceholderNode } from './placeholderNode'

export class CloudFormationNode extends AWSTreeNodeBase {
    public label?: string
    public tooltip?: string
    public iconPath?: { light: Uri; dark: Uri }

    protected lambdaResources: string[] | undefined
    protected stackDescribed: boolean = false

    public constructor(
        public readonly stackSummary: CloudFormation.StackSummary,
        public readonly cloudFormation: CloudFormation,
        public readonly regionLambdas: FunctionInfo[]
    ) {
        super(`${stackSummary.StackName} [${stackSummary.StackStatus}]`, TreeItemCollapsibleState.Collapsed)
        this.tooltip = `${this.stackSummary.StackName}-${this.stackSummary.StackId}`
        this.iconPath = {
            dark: Uri.file(ext.context.asAbsolutePath('resources/dark/cloudformation.svg')),
            light: Uri.file(ext.context.asAbsolutePath('resources/light/cloudformation.svg'))
        }
        this.contextValue = 'awsCloudFormationNode'
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        if (!this.regionLambdas || this.regionLambdas.length === 0) {
            return [new PlaceholderNode(
                localize('AWS.explorerNode.cloudFormation.noFunctions', '[no functions in this CloudFormation]')
            )]
        }

        if (!this.lambdaResources) {
            this.lambdaResources = await this.resolveLambdaResources()
        }

        if (this.lambdaResources.length === 0) {
            return [new PlaceholderNode(
                localize('AWS.explorerNode.cloudFormation.noFunctions', '[no functions in this CloudFormation]')
            )]
        }

        return this.regionLambdas
            .filter(lambdaInfo => this.lambdaResources!.indexOf(lambdaInfo.configuration.FunctionName || '') > -1)
            .map(lambdaInfo => new CloudFormationFunctionNode(lambdaInfo))
    }

    private async resolveLambdaResources(): Promise<string[]> {
        const client = await ext.sdkClientBuilder.createAndConfigureSdkClient(
            opts => new CloudFormation(opts),
            undefined,
            this.cloudFormation.config.region || ''
        )

        const res: CloudFormation.DescribeStackResourcesOutput =
            await client.describeStackResources({StackName: this.stackSummary.StackName}).promise()

        if (res.StackResources) {
            return res.StackResources
                .filter(it => it.ResourceType.includes('Lambda::Function'))
                .map(it => it.PhysicalResourceId || 'none')
        }

        return []
    }
}
