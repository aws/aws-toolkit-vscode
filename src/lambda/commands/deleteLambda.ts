/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import * as localizedText from '../../shared/localizedText'
import { DefaultLambdaClient } from '../../shared/clients/lambdaClient'
import { Result } from '../../shared/telemetry/telemetry'
import { showConfirmationMessage, showViewLogsMessage } from '../../shared/utilities/messages'
import { FunctionConfiguration } from 'aws-sdk/clients/lambda'
import { getLogger } from '../../shared/logger/logger'
import { telemetry } from '../../shared/telemetry/telemetry'

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
        telemetry.lambda_delete.emit({ duration: 0, result: 'Failed' })

        throw new TypeError('Lambda does not have a function name')
    }

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
        telemetry.lambda_delete.emit({
            result: deleteResult,
        })
    }
}
