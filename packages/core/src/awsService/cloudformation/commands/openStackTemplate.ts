/*!
import { getLogger } from '../../../shared/logger'
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { commands, window, workspace, ViewColumn, Position, Range, Selection, ProgressLocation } from 'vscode'
import { LanguageClient } from 'vscode-languageclient/node'
import { RequestType } from 'vscode-languageserver-protocol'
import { commandKey, formatMessage } from '../utils'
import { handleLspError } from '../utils/onlineErrorHandler'
import { getLogger } from '../../../shared/logger/logger'

interface GetStackTemplateParams {
    stackName: string
    primaryIdentifier?: string
}

interface GetStackTemplateResponse {
    templateBody: string
    lineNumber?: number
}

const GetStackTemplateRequest = new RequestType<GetStackTemplateParams, GetStackTemplateResponse, void>(
    'aws/cfn/stack/template'
)

function isValidStackName(stackName: string): boolean {
    // CloudFormation stack names: 1-128 chars, alphanumeric and hyphens, start with letter
    const stackNameRegex = /^[a-zA-Z][a-zA-Z0-9-]{0,127}$/
    return stackNameRegex.test(stackName)
}

export function openStackTemplateCommand(client: LanguageClient) {
    return commands.registerCommand(
        commandKey('api.openStackTemplate'),
        async (stackName: string, primaryIdentifier?: string) => {
            if (!stackName) {
                void window.showErrorMessage(formatMessage('No stack name provided'))
                return
            }

            if (!isValidStackName(stackName)) {
                void window.showErrorMessage(formatMessage('Invalid stack name format'))
                return
            }

            await window
                .withProgress(
                    {
                        location: ProgressLocation.Notification,
                        title: `Opening template for stack: ${stackName}`,
                        cancellable: false,
                    },
                    async () => {
                        try {
                            const response = await client.sendRequest(GetStackTemplateRequest, {
                                stackName,
                                primaryIdentifier,
                            })

                            if (!response?.templateBody) {
                                void window.showWarningMessage(
                                    formatMessage(`No template found for stack: ${stackName}`)
                                )
                                return
                            }

                            const doc = await workspace.openTextDocument({
                                content: response.templateBody,
                                language: response.templateBody.trim().startsWith('{') ? 'json' : 'yaml',
                            })

                            const editor = await window.showTextDocument(doc, ViewColumn.Active)

                            if (response.lineNumber !== undefined) {
                                const line = doc.lineAt(response.lineNumber)
                                const position = new Position(response.lineNumber, line.text.length)
                                editor.selection = new Selection(position, position)
                                editor.revealRange(new Range(position, position))
                            }

                            return response
                        } catch (error) {
                            getLogger().error('Failed to get stack template: %O', {
                                stackName,
                                primaryIdentifier,
                                error: error instanceof Error ? error.message : String(error),
                            })

                            await handleLspError(error, `Failed to open template for stack: ${stackName}`)
                        }
                    }
                )
                .then(async (response) => {
                    if (!response) {
                        return
                    }

                    const action = await window.showInformationMessage(
                        'Template opened. Would you like to save it locally?',
                        'Save As...',
                        'No Thanks'
                    )

                    if (action === 'Save As...') {
                        const extension = response.templateBody.trim().startsWith('{') ? 'json' : 'yaml'
                        const saveUri = await window.showSaveDialog({
                            defaultUri: workspace.workspaceFolders?.[0]?.uri.with({
                                path: `${workspace.workspaceFolders[0].uri.path}/${stackName}-template.${extension}`,
                            }),
                            filters: {
                                'CloudFormation Templates': [extension],
                                'All Files': ['*'],
                            },
                        })

                        if (saveUri) {
                            await workspace.fs.writeFile(saveUri, Buffer.from(response.templateBody, 'utf8'))
                            void window.showInformationMessage(`Template saved to ${saveUri.fsPath}`)
                        }
                    }
                })
        }
    )
}
