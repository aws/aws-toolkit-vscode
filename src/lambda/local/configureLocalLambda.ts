/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { getLogger, Logger } from '../../shared/logger'
import { recordLambdaConfigure, Result } from '../../shared/telemetry/telemetry'
import { getNormalizedRelativePath } from '../../shared/utilities/pathUtils'
import { getChildrenRange } from '../../shared/utilities/symbolUtilities'
import { getTabSize } from '../../shared/utilities/textDocumentUtilities'
import {
    ensureTemplatesConfigFileExists,
    getTemplatesConfigPath,
    showTemplatesConfigurationError,
    TemplatesConfigFieldTypeError,
    TemplatesConfigPopulator,
} from '../config/templates'

export interface ConfigureLocalLambdaContext {
    showTextDocument: typeof vscode.window.showTextDocument
    executeCommand: typeof vscode.commands.executeCommand
    showErrorMessage: typeof vscode.window.showErrorMessage
}

class DefaultConfigureLocalLambdaContext implements ConfigureLocalLambdaContext {
    public readonly showTextDocument = vscode.window.showTextDocument
    public readonly executeCommand = vscode.commands.executeCommand
    public readonly showErrorMessage = vscode.window.showErrorMessage
}

// Precondition: `handler` is a valid lambda handler name.
export async function configureLocalLambda(
    workspaceFolder: vscode.WorkspaceFolder,
    handler: string,
    samTemplate: vscode.Uri,
    context: ConfigureLocalLambdaContext = new DefaultConfigureLocalLambdaContext()
): Promise<void> {
    let configureResult: Result = 'Succeeded'
    const templateRelativePath = getNormalizedRelativePath(workspaceFolder.uri.fsPath, samTemplate.fsPath)

    const configPath: string = getTemplatesConfigPath(workspaceFolder.uri.fsPath)

    await ensureTemplatesConfigFileExists(configPath)

    const configPathUri = vscode.Uri.file(configPath)
    const editor: vscode.TextEditor = await context.showTextDocument(configPathUri)

    try {
        const configPopulationResult = new TemplatesConfigPopulator(editor.document.getText(), {
            formattingOptions: {
                insertSpaces: true,
                tabSize: getTabSize(editor),
                eol: editor.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n',
            },
        })
            .ensureTemplateHandlerPropertiesExist(templateRelativePath, handler)
            .getResults()

        if (configPopulationResult.isDirty) {
            await editor.edit(eb => {
                eb.replace(
                    new vscode.Range(
                        editor.document.positionAt(0),
                        editor.document.positionAt(editor.document.getText().length)
                    ),
                    configPopulationResult.json
                )
            })

            // We don't save the doc. The user has the option to revert changes, or make further edits.
        }

        await context.showTextDocument(editor.document, {
            selection: await getEventRange(editor, templateRelativePath, handler, context),
        })
    } catch (e) {
        configureResult = 'Failed'
        if (e instanceof TemplatesConfigFieldTypeError) {
            showTemplatesConfigurationError(e, context.showErrorMessage)
        } else {
            throw e
        }
    } finally {
        recordLambdaConfigure({ result: configureResult })
    }
}

async function getEventRange(
    editor: vscode.TextEditor,
    relativeTemplatePath: string,
    handler: string,
    context: ConfigureLocalLambdaContext
): Promise<vscode.Range> {
    const logger: Logger = getLogger()

    const symbols: vscode.DocumentSymbol[] | undefined = await context.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        editor.document.uri
    )

    const defaultRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0))

    if (!symbols || symbols.length < 1) {
        return defaultRange
    }

    const templatesSymbol: vscode.DocumentSymbol | undefined = symbols.find(c => c.name === 'templates')
    if (!templatesSymbol) {
        logger.warn(`Invalid format for document ${editor.document.uri}`)

        return defaultRange
    }

    const templateSymbol: vscode.DocumentSymbol | undefined = templatesSymbol.children.find(
        c => c.name === relativeTemplatePath
    )
    if (!templateSymbol) {
        logger.warn(`Cannot find template section '${relativeTemplatePath}' in: ${editor.document.uri}`)

        return defaultRange
    }

    const handlersSymbol: vscode.DocumentSymbol | undefined = templateSymbol!.children.find(c => c.name === 'handlers')
    if (!handlersSymbol) {
        logger.warn(`Cannot find handlers section for '${relativeTemplatePath}' in: ${editor.document.uri}`)

        return defaultRange
    }

    const handlerSymbol: vscode.DocumentSymbol | undefined = handlersSymbol.children.find(c => c.name === handler)
    if (!handlerSymbol) {
        logger.warn(`Cannot find config for handler: ${handler}`)

        return defaultRange
    }

    const eventSymbol: vscode.DocumentSymbol | undefined = handlerSymbol.children.find(c => c.name === 'event')
    if (!eventSymbol) {
        return handlerSymbol.range
    }

    return await getChildrenRange(eventSymbol)
}
