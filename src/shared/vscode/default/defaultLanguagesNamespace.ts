/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { LanguagesNamespace } from '..'

export class DefaultLanguagesNamespace implements LanguagesNamespace {
    public get onDidChangeDiagnostics(): vscode.Event<vscode.DiagnosticChangeEvent> {
        return vscode.languages.onDidChangeDiagnostics
    }

    public getLanguages(): Thenable<string[]> {
        return vscode.languages.getLanguages()
    }

    public match(selector: vscode.DocumentSelector, document: vscode.TextDocument): number {
        return vscode.languages.match(selector, document)
    }

    public getDiagnostics(resource: vscode.Uri): vscode.Diagnostic[]
    public getDiagnostics(): [vscode.Uri, vscode.Diagnostic[]][]
    public getDiagnostics(resource?: vscode.Uri): vscode.Diagnostic[] | [vscode.Uri, vscode.Diagnostic[]][] {
        if (!resource) {
            return vscode.languages.getDiagnostics()
        }

        return vscode.languages.getDiagnostics(resource)
    }

    public createDiagnosticCollection(name?: string): vscode.DiagnosticCollection {
        return vscode.languages.createDiagnosticCollection(name)
    }

    public registerCompletionItemProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.CompletionItemProvider,
        ...triggerCharacters: string[]
    ): vscode.Disposable {
        return vscode.languages.registerCompletionItemProvider(selector, provider, ...triggerCharacters)
    }

    public registerCodeActionsProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.CodeActionProvider,
        metadata?: vscode.CodeActionProviderMetadata
    ): vscode.Disposable {
        return vscode.languages.registerCodeActionsProvider(selector, provider, metadata)
    }

    public registerCodeLensProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.CodeLensProvider
    ): vscode.Disposable {
        return vscode.languages.registerCodeLensProvider(selector, provider)
    }

    public registerDefinitionProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.DefinitionProvider
    ): vscode.Disposable {
        return vscode.languages.registerDefinitionProvider(selector, provider)
    }

    public registerImplementationProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.ImplementationProvider
    ): vscode.Disposable {
        return vscode.languages.registerImplementationProvider(selector, provider)
    }

    public registerTypeDefinitionProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.TypeDefinitionProvider
    ): vscode.Disposable {
        return vscode.languages.registerTypeDefinitionProvider(selector, provider)
    }

    public registerHoverProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.HoverProvider
    ): vscode.Disposable {
        return vscode.languages.registerHoverProvider(selector, provider)
    }

    public registerDocumentHighlightProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.DocumentHighlightProvider
    ): vscode.Disposable {
        return vscode.languages.registerDocumentHighlightProvider(selector, provider)
    }

    public registerDocumentSymbolProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.DocumentSymbolProvider
    ): vscode.Disposable {
        return vscode.languages.registerDocumentSymbolProvider(selector, provider)
    }

    public registerWorkspaceSymbolProvider(
        provider: vscode.WorkspaceSymbolProvider
    ): vscode.Disposable {
        return vscode.languages.registerWorkspaceSymbolProvider(provider)
    }

    public registerReferenceProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.ReferenceProvider
    ): vscode.Disposable {
        return vscode.languages.registerReferenceProvider(selector, provider)
    }

    public registerRenameProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.RenameProvider
    ): vscode.Disposable {
        return vscode.languages.registerRenameProvider(selector, provider)
    }

    public registerDocumentFormattingEditProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.DocumentFormattingEditProvider
    ): vscode.Disposable {
        return vscode.languages.registerDocumentFormattingEditProvider(selector, provider)
    }

    public registerDocumentRangeFormattingEditProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.DocumentRangeFormattingEditProvider
    ): vscode.Disposable {
        return vscode.languages.registerDocumentRangeFormattingEditProvider(selector, provider)
    }

    public registerOnTypeFormattingEditProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.OnTypeFormattingEditProvider,
        firstTriggerCharacter: string,
        ...moreTriggerCharacter: string[]
    ): vscode.Disposable {
        return vscode.languages.registerOnTypeFormattingEditProvider(
            selector,
            provider,
            firstTriggerCharacter,
            ...moreTriggerCharacter
        )
    }

    public registerSignatureHelpProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.SignatureHelpProvider,
        ...triggerCharacters: string[]
    ): vscode.Disposable {
        return vscode.languages.registerSignatureHelpProvider(selector, provider, ...triggerCharacters)
    }

    public registerDocumentLinkProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.DocumentLinkProvider
    ): vscode.Disposable {
        return vscode.languages.registerDocumentLinkProvider(selector, provider)
    }

    public registerColorProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.DocumentColorProvider
    ): vscode.Disposable {
        return vscode.languages.registerColorProvider(selector, provider)
    }

    public registerFoldingRangeProvider(
        selector: vscode.DocumentSelector,
        provider: vscode.FoldingRangeProvider
    ): vscode.Disposable {
        return vscode.languages.registerFoldingRangeProvider(selector, provider)
    }

    public setLanguageConfiguration(
        language: string,
        configuration: vscode.LanguageConfiguration
    ): vscode.Disposable {
        return vscode.languages.setLanguageConfiguration(language, configuration)
    }
}
