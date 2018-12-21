/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import CloudFormation = require('aws-sdk/clients/cloudformation')
import { isNullOrUndefined } from 'util'
import * as vscode from 'vscode'
import { CloudFormationNode } from '../explorer/nodes/cloudFormationNode'
import { FunctionNode } from '../explorer/nodes/functionNode'
import { ext } from '../shared/extensionGlobals'

export async function getSelectedCloudFormationNode(element?: CloudFormationNode): Promise<CloudFormationNode> {
    if (element && element.stackSummary) {
        console.log('returning preselected node...')

        return element
    }
    throw new Error('No CloudFormation found.')
}

export async function getCloudFormationsForRegion(
    regionCode: string,
    lambdaFunctions: FunctionNode[]
): Promise<CloudFormationNode[]> {
    const client = await ext.sdkClientBuilder.createAndConfigureSdkClient(
        opts => new CloudFormation(opts),
        undefined,
        regionCode
    )

    return await listCloudFormations(client, lambdaFunctions)
}

export async function listCloudFormations(
    cloudFormation: CloudFormation,
    lambdaFunctions: FunctionNode[]
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
