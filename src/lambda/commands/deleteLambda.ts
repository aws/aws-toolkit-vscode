/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

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

        ext.lambdaOutputChannel.appendLine(
            `There was an error deleting ${node.info.configuration.FunctionArn}`
        )
        ext.lambdaOutputChannel.appendLine(error.toString())
        ext.lambdaOutputChannel.appendLine('')
    }

    refresh()
}
