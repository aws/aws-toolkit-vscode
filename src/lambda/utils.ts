/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { CloudFormation, Lambda } from 'aws-sdk'
import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import { CloudFormationClient } from '../shared/clients/cloudFormationClient'
import { LambdaClient } from '../shared/clients/lambdaClient'
import { ext } from '../shared/extensionGlobals'
import { getLogger, Logger } from '../shared/logger'
import { toArrayAsync } from '../shared/utilities/collectionUtils'
import { quickPickLambda } from './commands/quickPickLambda'
import { FunctionNodeBase } from './explorer/functionNode'

export async function selectLambdaNode(
    awsContext: AwsContext,
    element?: FunctionNodeBase
): Promise<FunctionNodeBase> {

    const logger: Logger = getLogger()

    if (element && element.configuration) {
        logger.info('returning preselected node...')

        return element
    }

    logger.info('prompting for lambda selection...')

    // TODO: we need to change this into a multi-step command to first obtain the region,
    // then query the lambdas in the region
    const regions = await awsContext.getExplorerRegions()
    if (regions.length === 0) {
        throw new Error('No regions defined for explorer, required until we have a multi-stage picker')
    }
    const client: LambdaClient = ext.toolkitClientBuilder.createLambdaClient(regions[0])
    const lambdas: Lambda.FunctionConfiguration[] = await toArrayAsync(listLambdaFunctions(client))

    // used to show a list of lambdas and allow user to select.
    // this is useful for calling commands from the command palette
    const selection = await quickPickLambda(lambdas, regions[0])
    if (selection && selection.configuration) {
        return selection
    }

    throw new Error('No lambda found.')
}

export async function* listCloudFormationStacks(
    client: CloudFormationClient
): AsyncIterableIterator<CloudFormation.StackSummary> {
    // TODO: this 'loading' message needs to go under each regional entry
    // in the explorer, and be removed when that region's query completes
    const status = vscode.window.setStatusBarMessage(
        localize('AWS.message.statusBar.loading.cloudFormation', 'Loading CloudFormation Stacks...')
    )

    try {
        yield* client.listStacks()
    } finally {
        status.dispose()
    }
}

export async function* listLambdaFunctions(client: LambdaClient): AsyncIterableIterator<Lambda.FunctionConfiguration> {

    const status = vscode.window.setStatusBarMessage(
        localize('AWS.message.statusBar.loading.lambda', 'Loading Lambdas...'))

    try {
        yield* client.listFunctions()

    } finally {
        if (!!status) {
            status.dispose()
        }
    }
}
