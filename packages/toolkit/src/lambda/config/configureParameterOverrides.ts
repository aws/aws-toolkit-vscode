/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { getNormalizedRelativePath } from '../../shared/utilities/pathUtils'
import { getChildrenRange } from '../../shared/utilities/symbolUtilities'
import { getTabSize } from '../../shared/utilities/textDocumentUtilities'
import {
    ensureTemplatesConfigFileExists,
    getTemplatesConfigPath,
    showTemplatesConfigurationError,
    TemplatesConfigFieldTypeError,
    TemplatesConfigPopulator,
} from './templates'

export interface ConfigureParameterOverridesContext {
    getWorkspaceFolder: typeof vscode.workspace.getWorkspaceFolder
    showErrorMessage: typeof vscode.window.showErrorMessage
    showTextDocument: typeof vscode.window.showTextDocument
    executeCommand: typeof vscode.commands.executeCommand
}

class DefaultConfigureParamOverridesContext implements ConfigureParameterOverridesContext {
    public readonly getWorkspaceFolder = vscode.workspace.getWorkspaceFolder

    public readonly showErrorMessage = vscode.window.showErrorMessage

    public readonly showTextDocument = vscode.window.showTextDocument

    public readonly executeCommand = vscode.commands.executeCommand
}

export async function configureParameterOverrides(
    {
        templateUri,
        requiredParameterNames = [],
    }: {
        templateUri: vscode.Uri
        requiredParameterNames?: Iterable<string>
    },
    context: ConfigureParameterOverridesContext = new DefaultConfigureParamOverridesContext()
): Promise<void> {
    const workspaceFolder = context.getWorkspaceFolder(templateUri)
    if (!workspaceFolder) {
        throw new Error(`Template ${templateUri.fsPath} is not in the workspace`)
    }

    const configPath = getTemplatesConfigPath(workspaceFolder.uri.fsPath)
    await ensureTemplatesConfigFileExists(configPath)
    const editor: vscode.TextEditor = await context.showTextDocument(vscode.Uri.file(configPath))

    const relativeTemplatePath = getNormalizedRelativePath(workspaceFolder.uri.fsPath, templateUri.fsPath)

    try {
        let populator = new TemplatesConfigPopulator(editor.document.getText(), {
            formattingOptions: {
                insertSpaces: true,
                tabSize: getTabSize(editor),
                eol: editor.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n',
            },
        })

        for (const parameterName of requiredParameterNames) {
            populator = populator.ensureTemplateParameterOverrideExists(relativeTemplatePath, parameterName)
        }

        const { json, isDirty } = populator.getResults()

        if (isDirty) {
            await editor.edit(eb => {
                eb.replace(
                    new vscode.Range(
                        editor.document.positionAt(0),
                        editor.document.positionAt(editor.document.getText().length)
                    ),
                    json
                )
            })

            // We don't save the doc. The user has the option to revert changes, or make further edits.
        }

        await context.showTextDocument(editor.document, {
            selection: await getParameterOverridesRange(
                {
                    editor,
                    relativeTemplatePath,
                },
                context
            ),
        })
    } catch (err) {
        if (err instanceof TemplatesConfigFieldTypeError) {
            showTemplatesConfigurationError(err, context.showErrorMessage)
        } else {
            throw err
        }
    }
}

async function getParameterOverridesRange(
    {
        editor,
        relativeTemplatePath,
    }: {
        editor: vscode.TextEditor
        relativeTemplatePath: string
    },
    context: ConfigureParameterOverridesContext
) {
    const logger = getLogger()

    const symbols: vscode.DocumentSymbol[] | undefined = await context.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        editor.document.uri
    )

    const defaultRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0))

    if (!symbols || symbols.length < 1) {
        return defaultRange
    }

    const templatesSymbol = symbols.find(c => c.name === 'templates')
    if (!templatesSymbol) {
        logger.warn(`Invalid format for document ${editor.document.uri}`)

        return defaultRange
    }

    const templateSymbol = templatesSymbol.children.find(c => c.name === relativeTemplatePath)
    if (!templateSymbol) {
        logger.warn(`Cannot find template section '${relativeTemplatePath}' in: ${editor.document.uri}`)

        return defaultRange
    }

    const parameterOverridesSymbol = templateSymbol.children.find(c => c.name === 'parameterOverrides')
    if (!parameterOverridesSymbol) {
        logger.warn(`Cannot find parameterOverrides section for '${relativeTemplatePath}' in: ${editor.document.uri}`)

        return defaultRange
    }

    return getChildrenRange(parameterOverridesSymbol)
}
