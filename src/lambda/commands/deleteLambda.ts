/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { LambdaClient } from '../../shared/clients/lambdaClient'
import { millisecondsSince, recordLambdaDelete, Result } from '../../shared/telemetry/telemetry'

const localize = nls.loadMessageBundle()

/**
 * @param message: Message displayed to user
 */
const confirm = async (message: string): Promise<boolean> => {
    // TODO: Re-use `confirm` throughout package (rather than cutting and pasting logic).
    const responseNo: string = localize('AWS.generic.response.no', 'No')
    const responseYes: string = localize('AWS.generic.response.yes', 'Yes')
    const response = await vscode.window.showWarningMessage(message, responseYes, responseNo)

    return response === responseYes
}

export async function deleteLambda({
    deleteParams,
    onConfirm = async () => {
        return await confirm(
            localize(
                'AWS.command.deleteLambda.confirm',
                "Are you sure you want to delete lambda function '{0}'?",
                deleteParams.functionName
            )
        )
    },
    ...restParams
}: {
    deleteParams: { functionName: string }
    lambdaClient: Pick<LambdaClient, 'deleteFunction'> // i.e. implements LambdaClient.deleteFunction
    outputChannel: vscode.OutputChannel
    onConfirm?(): Promise<boolean>
    onRefresh(): void
}): Promise<void> {
    if (!deleteParams.functionName) {
        return
    }
    const startTime = new Date()
    let deleteResult: Result = 'Succeeded'
    try {
        const isConfirmed = await onConfirm()
        if (isConfirmed) {
            await restParams.lambdaClient.deleteFunction(deleteParams.functionName)
            restParams.onRefresh()
        }
    } catch (err) {
        deleteResult = 'Failed'
        restParams.outputChannel.show(true)
        restParams.outputChannel.appendLine(
            localize(
                'AWS.command.deleteLambda.error',
                "There was an error deleting lambda function '{0}'",
                deleteParams.functionName
            )
        )
        restParams.outputChannel.appendLine(String(err)) // linter hates toString on type any
        restParams.outputChannel.appendLine('')
        restParams.onRefresh() // Refresh in case it was already deleted.
    } finally {
        recordLambdaDelete({
            createTime: startTime,
            duration: millisecondsSince(startTime),
            result: deleteResult,
        })
    }
}
