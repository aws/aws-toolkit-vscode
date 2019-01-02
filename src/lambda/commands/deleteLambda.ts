/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { ext } from '../../shared/extensionGlobals'
import { StandaloneFunctionNode } from '../explorer/standaloneNodes'

export async function deleteLambda(
    node: StandaloneFunctionNode,
    refresh: () => void
) {
    const client = ext.toolkitClientBuilder.createLambdaClient(node.regionCode)

    if (!node || !node.configuration.FunctionName) {
        return
    }

    try {
        await client.deleteFunction(node.configuration.FunctionName)
    } catch (err) {
        const error = err as Error

        ext.lambdaOutputChannel.show(true)
        ext.lambdaOutputChannel.appendLine(localize(
            'AWS.command.deleteLambda.error',
            "There was an error deleting lambda function '{0}'",
            node.configuration.FunctionArn
        ))
        ext.lambdaOutputChannel.appendLine(error.toString())
        ext.lambdaOutputChannel.appendLine('')
    }

    refresh()
}
