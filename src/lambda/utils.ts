/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { CloudFormation, Lambda } from 'aws-sdk'
import * as vscode from 'vscode'
import { CloudFormationClient } from '../shared/clients/cloudFormationClient'
import { LambdaClient } from '../shared/clients/lambdaClient'
import { getFamily, RuntimeFamily } from './models/samLambdaRuntime'

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
        localize('AWS.message.statusBar.loading.lambda', 'Loading Lambdas...')
    )

    try {
        yield* client.listFunctions()
    } finally {
        if (!!status) {
            status.dispose()
        }
    }
}

/**
 * Returns filename and function name corresponding to a Lambda.FunctionConfiguration
 * Only works for supported languages (Python/JS)
 * @param configuration Lambda configuration object from getFunction
 */
export function getLambdaDetails(
    configuration: Lambda.FunctionConfiguration
): {
    fileName: string
    functionName: string
} {
    let runtimeExtension: string
    switch (getFamily(configuration.Runtime!)) {
        case RuntimeFamily.Python:
            runtimeExtension = 'py'
            break
        case RuntimeFamily.NodeJS:
            runtimeExtension = 'js'
            break
        default:
            throw new Error(`Toolkit does not currently support imports for runtime: ${configuration.Runtime}`)
    }

    const handlerArr = configuration.Handler!.split('.')

    return {
        fileName: `${handlerArr.slice(0, handlerArr.length - 1).join('.')}.${runtimeExtension}`,
        functionName: handlerArr[handlerArr.length - 1]!,
    }
}
