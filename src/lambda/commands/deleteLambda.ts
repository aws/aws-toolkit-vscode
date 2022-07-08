/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../shared/extensionGlobals'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import * as localizedText from '../../shared/localizedText'
import { DefaultLambdaClient } from '../../shared/clients/lambdaClient'
import { millisecondsSince, recordLambdaDelete, Result } from '../../shared/telemetry/telemetry'
import { showConfirmationMessage, showViewLogsMessage } from '../../shared/utilities/messages'
import { FunctionConfiguration } from 'aws-sdk/clients/lambda'
import { getLogger } from '../../shared/logger/logger'

async function confirmDeletion(functionName: string, window = vscode.window): Promise<boolean> {
    return showConfirmationMessage(
        {
            prompt: localize(
                'AWS.command.deleteLambda.confirm',
                "Are you sure you want to delete lambda function '{0}'?",
                functionName
            ),
            confirm: localizedText.localizedDelete,
            cancel: localizedText.cancel,
        },
        window
    )
}

export async function deleteLambda(
    lambda: Pick<FunctionConfiguration, 'FunctionName'>,
    client: Pick<DefaultLambdaClient, 'deleteFunction'>,
    window = vscode.window
): Promise<void> {
    if (!lambda.FunctionName) {
        recordLambdaDelete({ duration: 0, result: 'Failed' })

        throw new TypeError('Lambda does not have a function name')
    }

    const startTime = new globals.clock.Date()
    let deleteResult: Result = 'Succeeded'

    try {
        if (await confirmDeletion(lambda.FunctionName, window)) {
            await client.deleteFunction(lambda.FunctionName)
        } else {
            deleteResult = 'Cancelled'
        }
    } catch (err) {
        deleteResult = 'Failed'
        getLogger().error(`Failed to delete lambda function "${lambda.FunctionName}": %O`, err)
        const message = localize(
            'AWS.command.deleteLambda.error',
            "There was an error deleting lambda function '{0}'",
            lambda.FunctionName
        )

        showViewLogsMessage(message, window)
    } finally {
        recordLambdaDelete({
            createTime: startTime,
            duration: millisecondsSince(startTime),
            result: deleteResult,
        })
    }
}
