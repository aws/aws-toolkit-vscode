/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import * as CloudFormation from '../../shared/cloudformation/cloudformation'
import { getLogger, Logger } from '../../shared/logger'
import { getChildrenRange, loadSymbols, LoadSymbolsContext } from '../../shared/utilities/symbolUtilities'
import { getParameterNames } from '../config/parameterUtils'

export interface SamParameterCompletionItemProviderContext extends LoadSymbolsContext {
    logger: Pick<Logger, 'warn'>
    getWorkspaceFolder: typeof vscode.workspace.getWorkspaceFolder
    loadTemplate: typeof CloudFormation.load
}

/**
 * Provides completion items (i.e. intellisense) for parameter names when editting `.aws/templates.json`,
 * by reading the list of parameters from the associated SAM template.
 *
 * This class may be modified in the future to also provide suggestions for parameter values, etc.
 */
export class SamParameterCompletionItemProvider implements vscode.CompletionItemProvider {
    public constructor(
        private readonly context: SamParameterCompletionItemProviderContext = {
            executeCommand: vscode.commands.executeCommand,
            logger: getLogger(),
            getWorkspaceFolder: vscode.workspace.getWorkspaceFolder,
            loadTemplate: CloudFormation.load,
        }
    ) {}

    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        completionContext: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[]> {
        const workspaceFolder = this.context.getWorkspaceFolder(document.uri)
        if (!workspaceFolder) {
            // This should never happen.
            this.context.logger.warn(
                `Cannot provide completion items for '${document.uri.fsPath}' beacuse it is not in the workspace.`
            )

            return []
        }

        const symbols: vscode.DocumentSymbol[] | undefined = await loadSymbols({
            uri: document.uri,
            context: this.context,
            maxRetries: 0,
        })
        if (!symbols) {
            return []
        }

        const templateUri = await getTemplateUri({
            workspaceUri: workspaceFolder.uri,
            symbols,
            position,
        })
        if (!templateUri) {
            return []
        }

        const prefix = this.getWordAt(document, position)
        const templateParameterNames = await getParameterNames(templateUri, this.context)

        return templateParameterNames
            .filter(name => !prefix || name.startsWith(prefix))
            .map(name => {
                const completionItem: vscode.CompletionItem = {
                    kind: vscode.CompletionItemKind.Reference,
                    label: name,
                    insertText: name,
                    range: new vscode.Range(position, position),
                }

                return completionItem
            })
    }

    private getWordAt(document: vscode.TextDocument, position: vscode.Position): string | undefined {
        const wordRange = document.getWordRangeAtPosition(position)
        if (!wordRange) {
            return undefined
        }

        // The JSON spec requires the use of double-quotes rather than single-quotes.
        return document
            .getText(wordRange)
            .replace(/^\"/, '') // strip leading quote character
            .replace(/\"$/, '') // strip trailing quote character
    }
}

async function getTemplateUri({
    workspaceUri,
    symbols,
    position,
}: {
    workspaceUri: vscode.Uri
    symbols: vscode.DocumentSymbol[]
    position: vscode.Position
}): Promise<vscode.Uri | undefined> {
    const templates = symbols.find(symbol => symbol.name === 'templates')
    if (!templates) {
        return undefined
    }

    const template = templates.children.find(child => child.range.contains(position))
    if (!template) {
        return undefined
    }

    // Only offer suggestions inside the 'parameterOverrides' property.
    const parameterOverrides = template.children.find(child => child.name === 'parameterOverrides')
    if (!parameterOverrides) {
        return undefined
    }

    const childrenRange = await getChildrenRange(parameterOverrides)
    if (!childrenRange.contains(position)) {
        return undefined
    }

    // Ensure that position is at a parameter name, not a value.
    if (parameterOverrides.children) {
        const override = parameterOverrides.children.find(child => child.range.contains(position))
        if (override) {
            if (!override.selectionRange.contains(position)) {
                return undefined
            }
        }
    }

    return vscode.Uri.file(path.join(workspaceUri.fsPath, template.name))
}
