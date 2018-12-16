/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import CloudFormation = require('aws-sdk/clients/cloudformation')
import Lambda = require('aws-sdk/clients/lambda')
import { isNullOrUndefined } from 'util'
import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import { ext } from '../shared/extensionGlobals'
import { quickPickLambda } from './commands/quickPickLambda'
import { CloudFormationNode } from './explorer/cloudFormationNode'
import { FunctionNode } from './explorer/functionNode'

export async function getSelectedCloudFormationNode(element?: CloudFormationNode): Promise<CloudFormationNode> {
    if (element && element.stackSummary) {
        console.log('returning preselected node...')

        return element
    }
    throw new Error('No CloudFormation found.')
}

export async function getSelectedLambdaNode(awsContext: AwsContext, element?: FunctionNode): Promise<FunctionNode> {
    if (element && element.functionConfiguration) {
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
    if (selection && selection.functionConfiguration) {
        return selection
    }

    throw new Error('No lambda found.')
}

export async function getCloudFormationsForRegion(regionCode: string,
                                                  lambdaFunctions: FunctionNode[]): Promise<CloudFormationNode[]> {
    const client = await ext.sdkClientBuilder.createAndConfigureSdkClient(
        opts => new CloudFormation(opts),
        undefined,
        regionCode
    )

    return await listCloudFormations(client, lambdaFunctions)
}

export async function listCloudFormations(cloudFormation: CloudFormation,
                                          lambdaFunctions: FunctionNode[]): Promise<CloudFormationNode[]> {
    // TODO: this 'loading' message needs to go under each regional entry
    // in the explorer, and be removed when that region's query completes
    const status = vscode.window.setStatusBarMessage('Loading CloudFormations...')
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
                    arr.push(new CloudFormationNode(c, cloudFormation, lambdaFunctions))
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

export async function getLambdaFunctionsForRegion(regionCode: string): Promise<FunctionNode[]> {
    const client = await ext.sdkClientBuilder.createAndConfigureSdkClient(
        opts => new Lambda(opts),
        undefined,
        regionCode
    )

    return listLambdas(client)
}

export async function listLambdas(lambda: Lambda): Promise<FunctionNode[]> {
    // TODO: this 'loading' message needs to go under each regional entry
    // in the explorer, and be removed when that region's query completes
    const status = vscode.window.setStatusBarMessage('Loading lambdas...')
    const arr: FunctionNode[] = []

    try {
        const request: Lambda.ListFunctionsRequest = {}
        do {
            const response: Lambda.ListFunctionsResponse = await lambda.listFunctions(request).promise()
            request.Marker = response.NextMarker
            if (response.Functions) {
                response.Functions.forEach(f => {
                    const func = new FunctionNode(f, lambda)
                    func.contextValue = 'awsLambdaFn'
                    arr.push(func)
                })
            }
        } while (!isNullOrUndefined(request.Marker))
    } catch (err) {
        const error = err as Error

        // TODO: Handle error gracefully, possibly add a node that can attempt to retry the operation
        console.error(error.message)
    } finally {
        status.dispose()
    }

    return arr
}
