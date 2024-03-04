/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import * as os from 'os'
const localize = nls.loadMessageBundle()

import { StepFunctions } from 'aws-sdk'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import { DefaultStepFunctionsClient, StepFunctionsClient } from '../../shared/clients/stepFunctionsClient'

import { getLogger, Logger } from '../../shared/logger'
import { Result } from '../../shared/telemetry/telemetry'
import { StateMachineNode } from '../explorer/stepFunctionsNodes'
import { previewStateMachineCommand } from '../activation'
import { telemetry } from '../../shared/telemetry/telemetry'

export async function downloadStateMachineDefinition(params: {
    outputChannel: vscode.OutputChannel
    stateMachineNode: StateMachineNode
    isPreviewAndRender?: boolean
}) {
    const logger: Logger = getLogger()
    let downloadResult: Result = 'Succeeded'
    const stateMachineName = params.stateMachineNode.details.name
    try {
        const client: StepFunctionsClient = new DefaultStepFunctionsClient(params.stateMachineNode.regionCode)
        const stateMachineDetails: StepFunctions.DescribeStateMachineOutput = await client.getStateMachineDetails(
            params.stateMachineNode.details.stateMachineArn
        )

        if (params.isPreviewAndRender) {
            const doc = await vscode.workspace.openTextDocument({
                language: 'asl',
                content: stateMachineDetails.definition,
            })

            const textEditor = await vscode.window.showTextDocument(doc)
            await previewStateMachineCommand.execute(textEditor)
        } else {
            const wsPath = vscode.workspace.workspaceFolders
                ? vscode.workspace.workspaceFolders[0].uri.fsPath
                : os.homedir()
            const defaultFilePath = path.join(wsPath, params.stateMachineNode.details.name + '.asl.json')
            const fileInfo = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(defaultFilePath) })

            if (fileInfo) {
                const filePath = fileInfo.fsPath
                fs.writeFileSync(filePath, stateMachineDetails.definition, 'utf8')
                const openPath = vscode.Uri.file(filePath)
                const doc = await vscode.workspace.openTextDocument(openPath)
                await vscode.window.showTextDocument(doc)
            }
        }
    } catch (err) {
        const error = err as Error
        logger.error(error)
        downloadResult = 'Failed'
        params.outputChannel.show(true)
        params.outputChannel.appendLine(
            localize(
                'AWS.message.error.stepfunctions.downloadStateMachineDefinition',
                "Unable to download state machine '{0}', check logs for details.",
                stateMachineName
            )
        )
        params.outputChannel.appendLine(error.message)
        params.outputChannel.appendLine('')
    } finally {
        telemetry.stepfunctions_downloadStateMachineDefinition.emit({ result: downloadResult })
    }
}
