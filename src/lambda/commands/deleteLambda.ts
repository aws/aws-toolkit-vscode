/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { ext } from '../../shared/extensionGlobals'
import { RegionFunctionNode } from '../explorer/functionNode'

export async function deleteLambda(node: RegionFunctionNode, refresh: () => void) {
    if (!node || !node.info.configuration.FunctionName) {
        return
    }

    try {
        const response = await node.info.client.deleteFunction({
            FunctionName: node.info.configuration.FunctionName
        }).promise()

        if (!!response.$response.error) {
            throw response.$response.error
        }
    } catch (err) {
        const error = err as Error

        ext.lambdaOutputChannel.show(true)
        ext.lambdaOutputChannel.appendLine(localize(
            'AWS.command.deleteLambda.error',
            "There was an error deleting lambda function '{0}'",
            node.info.configuration.FunctionArn
        ))
        ext.lambdaOutputChannel.appendLine(error.toString())
        ext.lambdaOutputChannel.appendLine('')
    }

    refresh()
}
