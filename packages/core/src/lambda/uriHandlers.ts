/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { SearchParams } from '../shared/vscode/uriHandler'
import { openLambdaFolderForEdit } from './commands/editLambda'
import { showConfirmationMessage } from '../shared/utilities/messages'
import globals from '../shared/extensionGlobals'
import { telemetry } from '../shared/telemetry/telemetry'
import { ToolkitError, isUserCancelledError } from '../shared/errors'
import { getLogger } from '../shared/logger/logger'

const localize = nls.loadMessageBundle()

export function handleLambdaUriError(e: unknown, functionName: string, region: string): void {
    // Classify cancellations for telemetry metrics
    const message = e instanceof Error ? e.message : ''
    const isCancellation =
        isUserCancelledError(e) ||
        message.toLowerCase().includes('canceled') ||
        message.toLowerCase().includes('cancelled')

    if (isCancellation) {
        getLogger().info(`Opening Lambda function cancelled: ${message}`)
        // Record cancellation in telemetry but don't pop-up error to user
        telemetry.record({
            result: 'Cancelled',
            reasonDesc: message,
        })
        return
    }

    // Handle other errors
    void vscode.window.showErrorMessage(`Unable to open function ${functionName} in region ${region}: ${e}`)
    throw ToolkitError.chain(e, 'Failed to open Lambda function')
}

export function registerLambdaUriHandler() {
    async function openFunctionHandler(params: ReturnType<typeof parseOpenParams>) {
        await telemetry.lambda_uriHandler.run(async () => {
            try {
                if (params.isCfn === 'true') {
                    const response = await showConfirmationMessage({
                        prompt: localize(
                            'AWS.lambda.open.confirmInStack',
                            'The function you are attempting to open is in a CloudFormation stack. Editing the function code could lead to stack drift.'
                        ),
                        confirm: localize('AWS.lambda.open.confirmStack', 'Confirm'),
                        cancel: localize('AWS.lambda.open.cancelStack', 'Cancel'),
                    })
                    if (!response) {
                        return
                    }
                }
                await openLambdaFolderForEdit(params.functionName, params.region)
            } catch (e) {
                handleLambdaUriError(e, params.functionName, params.region)
            }
        })
    }

    return vscode.Disposable.from(
        globals.uriHandler.onPath('/lambda/load-function', openFunctionHandler, parseOpenParams)
    )
}

// Sample url:
// vscode://AmazonWebServices.aws-toolkit-vscode/lambda/load-function?functionName=fnf-func-1&region=us-east-1&isCfn=true
export function parseOpenParams(query: SearchParams) {
    return {
        functionName: query.getOrThrow(
            'functionName',
            localize('AWS.lambda.open.missingName', 'A function name must be provided')
        ),
        region: query.getOrThrow('region', localize('AWS.lambda.open.missingRegion', 'A region must be provided')),
        isCfn: query.get('isCfn'),
    }
}
