/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { LambdaClient } from '../../shared/clients/lambdaClient'
import { StandaloneFunctionNode } from '../explorer/standaloneNodes'

/**
 * @param message: Message displayed to user
 */
const confirm = async (message: string): Promise<boolean> => {
    // TODO: Re-use `confirm` throughout package (rather than cutting and pasting logic).
    const responseNo: string = localize('AWS.generic.response.no', 'No')
    const responseYes: string = localize('AWS.generic.response.yes', 'Yes')
    const response = await vscode.window.showWarningMessage(
      message,
      responseYes,
      responseNo
    )

    return response === responseYes
}
export async function deleteLambda({
    onConfirm = async () => {
        return await confirm(localize(
          'AWS.command.deleteLambda.confirm',
          "Are you sure you want to delete lambda function '{0}'?",
          restParams.node.configuration.FunctionName
        ))
    },
    ...restParams
}: {
    lambdaClient: LambdaClient
    node: StandaloneFunctionNode, // TODO: Change to deleteParams: Lambda.Types.DeleteFunctionRequest
    outputChannel: vscode.OutputChannel,
    onRefresh(): void,
    onConfirm?(): Promise<boolean>,
}): Promise<void> {

    if (!restParams.node.configuration.FunctionName) {
        return
    }
    try {
        const isConfirmed = await onConfirm()
        if (isConfirmed) {
            await restParams.lambdaClient.deleteFunction(restParams.node.configuration.FunctionName)
        }
    } catch (err) {
        restParams.outputChannel.show(true)
        restParams.outputChannel.appendLine(localize(
            'AWS.command.deleteLambda.error',
            "There was an error deleting lambda function '{0}'",
            restParams.node.configuration.FunctionArn
        ))
        restParams.outputChannel.appendLine(String(err)) // linter hates toString on type any
        restParams.outputChannel.appendLine('')
    } finally {
      restParams.onRefresh()
    }
}
