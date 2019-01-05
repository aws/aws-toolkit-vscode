/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import CloudFormation = require('aws-sdk/clients/cloudformation')
import Lambda = require('aws-sdk/clients/lambda')
import { isNullOrUndefined } from 'util'
import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import { ext } from '../shared/extensionGlobals'
import { AWSTreeNodeBase } from '../shared/treeview/awsTreeNodeBase'
import { quickPickLambda } from './commands/quickPickLambda'
import { CloudFormationNode } from './explorer/cloudFormationNode'
import { FunctionNodeBase } from './explorer/functionNode'
import { FunctionInfo } from './functionInfo'

export async function getSelectedCloudFormationNode(element?: CloudFormationNode): Promise<CloudFormationNode> {
    if (element && element.stackSummary) {
        console.log('returning preselected node...')

        return element
    }
    throw new Error('No CloudFormation found.')
}

export async function selectLambdaNode(
    awsContext: AwsContext,
    element?: FunctionNodeBase
): Promise<FunctionNodeBase> {
    if (element && element.info.configuration) {
        console.log('returning preselected node...')

        return element
    }

    console.log('prompting for lambda selection...')

    // TODO: we need to change this into a multi-step command to first obtain the region,
    // then query the lambdas in the region
    const regions = await awsContext.getExplorerRegions()
    if (regions.length === 0) {
        throw new Error('No regions defined for explorer, required until we have a multi-stage picker')
    }
    const lambdas = await listLambdas(
        await ext.sdkClientBuilder.createAndConfigureSdkClient(
            opts => new Lambda(opts),
            undefined,
            regions[0]
        )
    )

    // used to show a list of lambdas and allow user to select.
    // this is useful for calling commands from the command palette
    const selection = await quickPickLambda(lambdas)
    if (selection && selection.info.configuration) {
        return selection
    }

    throw new Error('No lambda found.')
}

export async function getCloudFormationNodesForRegion(
    parent: AWSTreeNodeBase,
    regionCode: string,
    lambdaFunctions: FunctionInfo[]
): Promise<CloudFormationNode[]> {
    const client = await ext.sdkClientBuilder.createAndConfigureSdkClient(
        opts => new CloudFormation(opts),
        undefined,
        regionCode
    )

    return await listCloudFormationNodes(parent, client, lambdaFunctions)
}

export async function listCloudFormationNodes(
    parent: AWSTreeNodeBase,
    cloudFormation: CloudFormation,
    lambdaFunctions: FunctionInfo[]
): Promise<CloudFormationNode[]> {
    // TODO: this 'loading' message needs to go under each regional entry
    // in the explorer, and be removed when that region's query completes
    const status = vscode.window.setStatusBarMessage(
        localize('AWS.message.statusBar.loading.cloudFormation', 'Loading CloudFormation Stacks...'))
    const arr: CloudFormationNode[] = []

    try {
        const request: CloudFormation.ListStacksInput = {
            StackStatusFilter: ['CREATE_COMPLETE', 'UPDATE_COMPLETE']
        }
        do {
            const response: CloudFormation.ListStacksOutput = await cloudFormation.listStacks(request).promise()
            request.NextToken = response.NextToken
            if (response.StackSummaries) {
                response.StackSummaries.forEach(c => {
                    arr.push(new CloudFormationNode(parent, c, cloudFormation, lambdaFunctions))
                })
            }
        } while (!isNullOrUndefined(request.NextToken))
    } catch (err) {
        const error = err as Error

        // TODO: Handle error gracefully, possibly add a node that can attempt to retry the operation
        console.error(error.message)
    } finally {
        status.dispose()
    }

    return arr
}

export async function getLambdaFunctionsForRegion(regionCode: string): Promise<FunctionInfo[]> {
    const client = await ext.sdkClientBuilder.createAndConfigureSdkClient(
        opts => new Lambda(opts),
        undefined,
        regionCode
    )

    return listLambdas(client)
}

export async function listLambdas(client: Lambda): Promise<FunctionInfo[]> {
    const status = vscode.window.setStatusBarMessage(
        localize('AWS.message.statusBar.loading.lambda', 'Loading Lambdas...'))

    try {
        let result: FunctionInfo[] = []
        const request: Lambda.ListFunctionsRequest = {}
        do {
            const response: Lambda.ListFunctionsResponse = await client.listFunctions(request).promise()
            request.Marker = response.NextMarker

            if (!!response.Functions) {
                result = result.concat(response.Functions.map(f => ({
                    configuration: f,
                    client
                })))
            }
        } while (!!request.Marker)

        return result
    } catch (err) {
        const error = err as Error

        // TODO: Handle error gracefully, possibly add a node that can attempt to retry the operation
        console.error(error.message)

        return []
    } finally {
        if (!!status) {
            status.dispose()
        }
    }
}
