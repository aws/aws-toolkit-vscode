/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { isNullOrUndefined } from 'util'
import { ext } from '../shared/extensionGlobals'
import { FunctionNode } from './explorer/functionNode'
import { quickPickLambda } from './commands/quickPickLambda'
import Lambda = require('aws-sdk/clients/lambda')
import { AwsContext } from '../shared/awsContext'

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
    const lambdas = await listLambdas(await ext.sdkClientBuilder.createAndConfigureSdkClient(Lambda, undefined, regions[0]))

    // used to show a list of lambdas and allow user to select.
    // this is useful for calling commands from the command palette
    const selection = await quickPickLambda(lambdas)
    if (selection && selection.functionConfiguration) {
        return selection
    }

    throw new Error('No lambda found.')
}

export async function getLambdaFunctionsForRegion(regionCode: string): Promise<FunctionNode[]> {
    const client = await ext.sdkClientBuilder.createAndConfigureSdkClient(Lambda, undefined, regionCode)
    return listLambdas(client)
}

export async function listLambdas(lambda: Lambda): Promise<FunctionNode[]> {
    // TODO: this 'loading' message needs to go under each regional entry
    // in the explorer, and be removed when that region's query completes
    const status = vscode.window.setStatusBarMessage('Loading lambdas...')
    let arr: FunctionNode[] = []

    try {
        const request: Lambda.ListFunctionsRequest = {}
        do {
            await lambda.listFunctions(request)
                .promise()
                .then((r: Lambda.ListFunctionsResponse) => {
                    request.Marker = r.NextMarker
                    if (r.Functions) {
                        r.Functions.forEach((f: Lambda.FunctionConfiguration) => {
                            const func = new FunctionNode(f, lambda)
                            func.contextValue = 'awsLambdaFn'
                            arr.push(func)
                        })
                    }

                })
        } while (!isNullOrUndefined(request.Marker))
    } catch (error) {
        // TODO:
    }

    status.dispose()
    return arr
}

