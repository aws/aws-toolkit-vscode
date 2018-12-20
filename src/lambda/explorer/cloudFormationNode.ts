/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import CloudFormation = require('aws-sdk/clients/cloudformation')

import { TreeItem, TreeItemCollapsibleState, Uri } from 'vscode'

import { ext } from '../../shared/extensionGlobals'
import { AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase'
import { FunctionNode } from './functionNode'
import { NoFunctionsNode } from './noFunctionsNode'

export class CloudFormationNode extends AWSTreeNodeBase implements TreeItem {
    public static contextValue: string = 'awsCloudFormation'
    public contextValue: string = CloudFormationNode.contextValue

    public label?: string
    public tooltip?: string
    public iconPath?: { light: Uri; dark: Uri }

    protected readonly lambdaResources: string[] = []
    protected stackDescribed: boolean = false

    public constructor(public readonly stackSummary: CloudFormation.StackSummary,
                       public readonly cloudFormation: CloudFormation,
                       public readonly regionLambdas: FunctionNode[]) {
        super()
        this.label = `${this.stackSummary.StackName} [${this.stackSummary.StackStatus}]`
        this.tooltip = `${this.stackSummary.StackName}-${this.stackSummary.StackId}`
        this.iconPath = {
            dark: Uri.file(ext.context.asAbsolutePath('resources/dark/cloudformation.svg')),
            light: Uri.file(ext.context.asAbsolutePath('resources/light/cloudformation.svg'))
        }
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {

        if (!this.regionLambdas || this.regionLambdas.length === 0) {
            return [new NoFunctionsNode(
                localize('AWS.explorerNode.cloudFormation.noFunctions', '[no functions in this CloudFormation]'),
                'awsCloudFormationNoFns'
            )]
        }

        return this.resolveLambdaResources().then(() => {
            if (this.lambdaResources.length === 0) {
                return [new NoFunctionsNode(
                    localize('AWS.explorerNode.cloudFormation.noFunctions', '[no functions in this CloudFormation]'),
                    'awsCloudFormationNoFns'
                )]
            }

            const children: AWSTreeNodeBase[] = this.regionLambdas
                .filter(it => this.lambdaResources.indexOf(it.functionConfiguration.FunctionName || '') > -1)

            return children
        })

    }

    public getTreeItem(): TreeItem {
        const item = new TreeItem(this.label || '', TreeItemCollapsibleState.Collapsed)
        item.tooltip = this.tooltip
        item.contextValue = this.contextValue
        item.iconPath = this.iconPath

        return item
    }

    private async resolveLambdaResources(): Promise<void> {
        if (!this.stackDescribed) {
            const client = await ext.sdkClientBuilder.createAndConfigureSdkClient(
                opts => new CloudFormation(opts),
                undefined,
                this.cloudFormation.config.region || ''
            )

            const res: CloudFormation.DescribeStackResourcesOutput =
                await client.describeStackResources({StackName: this.stackSummary.StackName}).promise()

            if (res.StackResources) {
                res.StackResources
                    .filter(it => it.ResourceType.includes('Lambda::Function'))
                    .map(it => it.PhysicalResourceId || 'none')
                    .forEach(it => this.lambdaResources.push(it))
            }
            this.stackDescribed = true
        }
    }
}
