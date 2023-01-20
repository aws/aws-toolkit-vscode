/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLanguageService, LanguageService, SchemasSettings, WorkspaceContextService } from 'yaml-language-server'
import { SettingsState } from 'yaml-language-server/lib/umd/yamlSettings'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { createConverter as p2cConverter } from 'vscode-languageclient/lib/protocolConverter'
import { TextDocumentValidator } from '../lsp/validator'
import { CloudFormation } from '../cloudformation/cloudformation'
import { readFileSync } from 'fs-extra'
import { getLogger } from '../logger'
import { getIdeProperties } from '../extensionUtilities'

export async function activateYAMLLanguageService(): Promise<LanguageService> {
    const resolver = (uri: string): Promise<string> => {
        try {
            return Promise.resolve(readFileSync(vscode.Uri.parse(uri).fsPath).toString())
        } catch (e) {
            getLogger().error(`YAML Service: failed to read schema URI "${uri}": ${e}`)
            throw new Error(`${getIdeProperties().company} Toolkit could not parse JSON schema URI: ${uri}`)
        }
    }

    const workspaceContext = {
        resolveRelativePath: (path: string, resource: string) => '',
    } as WorkspaceContextService

    const connection = {
        onRequest(method: string, handler: any) {},
    }

    const settings = new SettingsState()

    // eslint-disable-next-line no-null/no-null
    const yamlService = getLanguageService(resolver, workspaceContext, connection as any, null as any, settings)
    configureLanguageService(yamlService, new Map())

    const converter = p2cConverter()
    const selector = [{ language: 'yaml' }, { pattern: '*.y(a)ml' }]

    function asTextDocument(document: vscode.TextDocument): TextDocument {
        return TextDocument.create(document.uri.toString(), document.languageId, document.version, document.getText())
    }

    vscode.languages.registerCompletionItemProvider(selector, {
        async provideCompletionItems(document, position, token, context) {
            const completion = await yamlService.doComplete(asTextDocument(document), position, false)

            // completion results types are conflicting for InsertReplaceEdit so just cast as any.
            // It isn't ideal but InsertReplaceEdit isn't used in yaml-language-server
            return converter.asCompletionResult(completion as any)
        },
    })

    vscode.languages.registerHoverProvider(selector, {
        async provideHover(document, position, token) {
            const hoverItem = await yamlService.doHover(asTextDocument(document), position)
            return converter.asHover(hoverItem)
        },
    })

    const diagnosticCollection = vscode.languages.createDiagnosticCollection('YAML')
    const validator = new TextDocumentValidator(async (document: TextDocument) => {
        const diagnostics = await yamlService.doValidation(document, false)
        const filteredDiagnostics = diagnostics.filter(x => {
            // filter out incorrect type errors that occur because of the lack of support for intrinsic functions
            const currentLine = document.getText(
                new vscode.Range(
                    new vscode.Position(x.range.start.line, 0),
                    new vscode.Position(x.range.end.line, x.range.end.character)
                )
            )
            const erroredOnTag = CloudFormation.cloudFormationTags.some(tag => currentLine.includes(tag))
            return !(x.message.startsWith('Incorrect type') && erroredOnTag)
        })
        diagnosticCollection.set(vscode.Uri.parse(document.uri), converter.asDiagnostics(filteredDiagnostics))
    }, 200)

    vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
        validator.triggerValidation(asTextDocument(event.document))
    })

    vscode.workspace.onDidCloseTextDocument((document: vscode.TextDocument) => {
        validator.cleanPendingValidation(asTextDocument(document))
        diagnosticCollection.set(document.uri, [])
    })

    return yamlService
}

export function configureLanguageService(
    languageService: LanguageService,
    schemaMap: Map<string, Map<string, vscode.Uri>>
): void {
    const schemaSettings: SchemasSettings[] = []
    for (const [filePath, schemas] of schemaMap) {
        for (const [_, schemaUri] of schemas) {
            if (schemaUri) {
                schemaSettings.push({
                    fileMatch: [filePath],
                    uri: 'file://' + encodeURI(schemaUri.fsPath), // the file system path is encoded because os x has a space in the path and markdown will fail
                })
            }
        }
    }
    languageService.configure({
        completion: true,
        validate: true,
        hover: true,
        customTags: CloudFormation.cloudFormationTags,
        schemas: schemaSettings,
    })
}
