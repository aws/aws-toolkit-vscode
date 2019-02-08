/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { OutputChannel, window } from 'vscode'
import { loadMessageBundle } from 'vscode-nls'
const localize = loadMessageBundle()

import { LambdaClient } from '../../shared/clients/lambdaClient'
import { StandaloneFunctionNode } from '../explorer/standaloneNodes'

export async function deleteLambda({
                           lambdaClient,
                           node,
                           outputChannel,
                           onRefresh,
                           onConfirm = async () => {
                               const responseNo: string = localize('AWS.generic.response.no', 'No')
                               const responseYes: string = localize('AWS.generic.response.yes', 'Yes')
                               const response = await window.showWarningMessage(
                                 localize(
                                   'AWS.command.deleteLambda.confirm',
                                   "Are you sure you want to delete lambda function '{0}'?",
                                   node.configuration.FunctionName
                                 ),
                                 responseYes,
                                 responseNo
                               )

                               return response === responseYes
                           },
                           onError = (error: any) => {
                               outputChannel.show(true)
                               outputChannel.appendLine(localize(
                                   'AWS.command.deleteLambda.error',
                                   "There was an error deleting lambda function '{0}'",
                                   node.configuration.FunctionArn
                                 ))
                               outputChannel.appendLine(String(error)) // linter hates toString on type any
                               outputChannel.appendLine('')
                           }
}: {
  lambdaClient: LambdaClient
  node: StandaloneFunctionNode,
  outputChannel: OutputChannel,
  onError?(err: any): void
  onRefresh(): void,
  onConfirm?(): Promise<boolean>,
}): Promise<void> {

    if (!node.configuration.FunctionName) {
        return
    }
    try {
        const isConfirmed = await onConfirm()
        if (isConfirmed) {
            await lambdaClient.deleteFunction(node.configuration.FunctionName)
        }
    } catch (err) {
        onError(err)
    } finally {
        onRefresh()
    }
}
