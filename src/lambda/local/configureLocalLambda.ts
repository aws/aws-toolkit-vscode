/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { writeFile } from '../../shared/filesystem'
import { getLogger, Logger } from '../../shared/logger'
import { getChildrenRange } from '../../shared/utilities/symbolUtilities'
import {
    getTemplateRelativePath,
    getTemplatesConfigPath,
    HandlerConfig,
    load,
    TemplatesConfigPopulator
} from '../config/templates'

export interface ConfigureLocalLambdaContext {
    showTextDocument: typeof vscode.window.showTextDocument
    executeCommand: typeof vscode.commands.executeCommand
    showInformationMessage: typeof vscode.window.showInformationMessage
}

class DefaultConfigureLocalLambdaContext implements ConfigureLocalLambdaContext {
    public readonly showTextDocument = vscode.window.showTextDocument
    public readonly executeCommand = vscode.commands.executeCommand
    public readonly showInformationMessage = vscode.window.showInformationMessage
}

// Precondition: `handler` is a valid lambda handler name.
export async function configureLocalLambda(
    workspaceFolder: vscode.WorkspaceFolder,
    handler: string,
    samTemplate: vscode.Uri,
    context: ConfigureLocalLambdaContext = new DefaultConfigureLocalLambdaContext()
): Promise<void> {

    const templateRelativePath = getTemplateRelativePath(samTemplate.fsPath, workspaceFolder.uri.fsPath)
    const configPath: string = getTemplatesConfigPath(workspaceFolder.uri.fsPath)

    const configPopulationResult = new TemplatesConfigPopulator(await load(configPath))
        .ensureTemplateHandlerPropertiesExist(templateRelativePath, handler)
        .getResults()

    if (configPopulationResult.isDirty) {
        await writeFile(
            configPath,
            JSON.stringify(configPopulationResult.templatesConfig, undefined, 4)
        )
    }

    const configPathUri = vscode.Uri.file(configPath)
    const editor: vscode.TextEditor = await context.showTextDocument(configPathUri)
    // Perf: TextDocument.save is smart enough to no-op if the document is not dirty.
    await editor.document.save()

    await context.showTextDocument(
        editor.document,
        { selection: await getEventRange(editor, templateRelativePath, handler, context) }
    )
}

export async function getLocalLambdaConfiguration(
    workspaceFolder: vscode.WorkspaceFolder,
    handler: string,
    samTemplate: vscode.Uri,
): Promise<HandlerConfig> {
    const templateRelativePath = getTemplateRelativePath(samTemplate.fsPath, workspaceFolder.uri.fsPath)
    const configPath: string = getTemplatesConfigPath(workspaceFolder.uri.fsPath)

    const configPopulationResult = new TemplatesConfigPopulator(await load(configPath))
        .ensureTemplateHandlerSectionExists(templateRelativePath, handler)
        .getResults()

    return configPopulationResult.templatesConfig.templates[templateRelativePath].handlers![handler]!
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

    const defaultRange = new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(0, 0)
    )

    if (!symbols || symbols.length < 1) {
        return defaultRange
    }

    const templatesSymbol: vscode.DocumentSymbol | undefined = symbols.find(c => c.name === 'templates')
    if (!templatesSymbol) {
        logger.warn(`Invalid format for document ${editor.document.uri}`)

        return defaultRange
    }

    const templateSymbol: vscode.DocumentSymbol | undefined =
        templatesSymbol!.children.find(c => c.name === relativeTemplatePath)
    if (!templateSymbol) {
        logger.warn(`Unable to find template section ${relativeTemplatePath} in ${editor.document.uri}`)

        return defaultRange
    }

    const handlersSymbol: vscode.DocumentSymbol | undefined = templateSymbol!.children.find(c => c.name === 'handlers')
    if (!handlersSymbol) {
        logger.warn(`Unable to find handlers section for ${relativeTemplatePath} in ${editor.document.uri}`)

        return defaultRange
    }

    const handlerSymbol: vscode.DocumentSymbol | undefined = handlersSymbol.children.find(c => c.name === handler)
    if (!handlerSymbol) {
        logger.warn(`Unable to find config for handler ${handler}`)

        return defaultRange
    }

    const eventSymbol: vscode.DocumentSymbol | undefined = handlerSymbol.children.find(c => c.name === 'event')
    if (!eventSymbol) {
        return handlerSymbol.range
    }

    return await getChildrenRange(eventSymbol)
}
