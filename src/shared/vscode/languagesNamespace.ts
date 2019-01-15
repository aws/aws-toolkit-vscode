/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from './types'

export interface LanguagesNamespace {
    readonly onDidChangeDiagnostics: vscode.Event<vscode.DiagnosticChangeEvent>

    getLanguages(): Thenable<string[]>

    match(selector: vscode.DocumentSelector, document: vscode.TextDocument): number

    getDiagnostics(resource: vscode.Uri): vscode.Diagnostic[]
    getDiagnostics(): [vscode.Uri, vscode.Diagnostic[]][]

    createDiagnosticCollection(name?: string): vscode.DiagnosticCollection

    registerCompletionItemProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.CompletionItemProvider,
        ...triggerCharacters: string[]
    ): vscode.Disposable

    registerCodeActionsProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.CodeActionProvider,
        metadata?: vscode.CodeActionProviderMetadata
    ): vscode.Disposable

    registerCodeLensProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.CodeLensProvider
    ): vscode.Disposable

    registerDefinitionProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.DefinitionProvider
    ): vscode.Disposable

    registerImplementationProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.ImplementationProvider
    ): vscode.Disposable

    registerTypeDefinitionProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.TypeDefinitionProvider
    ): vscode.Disposable

    registerHoverProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.HoverProvider
    ): vscode.Disposable

    registerDocumentHighlightProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.DocumentHighlightProvider
    ): vscode.Disposable

    registerDocumentSymbolProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.DocumentSymbolProvider
    ): vscode.Disposable

    registerWorkspaceSymbolProvider(
        provider: vscode.WorkspaceSymbolProvider
    ): vscode.Disposable

    registerReferenceProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.ReferenceProvider
    ): vscode.Disposable

    registerRenameProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.RenameProvider
    ): vscode.Disposable

    registerDocumentFormattingEditProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.DocumentFormattingEditProvider
    ): vscode.Disposable

    registerDocumentRangeFormattingEditProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.DocumentRangeFormattingEditProvider
    ): vscode.Disposable

    registerOnTypeFormattingEditProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.OnTypeFormattingEditProvider,
        firstTriggerCharacter: string,
        ...moreTriggerCharacter: string[]
    ): vscode.Disposable

    registerSignatureHelpProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.SignatureHelpProvider,
        ...triggerCharacters: string[]
    ): vscode.Disposable

    registerDocumentLinkProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.DocumentLinkProvider
    ): vscode.Disposable

    registerColorProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.DocumentColorProvider
    ): vscode.Disposable

    registerFoldingRangeProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.FoldingRangeProvider
    ): vscode.Disposable

    setLanguageConfiguration(
        language: string,
        configuration: vscode.LanguageConfiguration
    ): vscode.Disposable
}
