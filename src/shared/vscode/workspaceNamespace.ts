/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from './types'

export interface WorkspaceNamespace {
    readonly onDidChangeWorkspaceFolders: vscode.Event<vscode.WorkspaceFoldersChangeEvent>

    readonly onDidOpenTextDocument: vscode.Event<vscode.TextDocument>

    readonly onDidCloseTextDocument: vscode.Event<vscode.TextDocument>

    readonly onDidChangeTextDocument: vscode.Event<vscode.TextDocumentChangeEvent>

    readonly onWillSaveTextDocument: vscode.Event<vscode.TextDocumentWillSaveEvent>

    readonly onDidSaveTextDocument: vscode.Event<vscode.TextDocument>

    readonly onDidChangeConfiguration: vscode.Event<vscode.ConfigurationChangeEvent>

    workspaceFolders: vscode.WorkspaceFolder[] | undefined

    name: string | undefined

    textDocuments: vscode.TextDocument[]

    getWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder | undefined

    asRelativePath(pathOrUri: string | vscode.Uri, includeWorkspaceFolder?: boolean): string

    updateWorkspaceFolders(
        start: number,
        deleteCount: number | undefined | null,
        ...workspaceFoldersToAdd: {
            uri: vscode.Uri
            name?: string
        }[]
    ): boolean

    createFileSystemWatcher(
        globPattern: vscode.GlobPattern,
        ignoreCreateEvents?: boolean,
        ignoreChangeEvents?: boolean,
        ignoreDeleteEvents?: boolean
    ): vscode.FileSystemWatcher

    findFiles(
        include: vscode.GlobPattern,
        exclude?: vscode.GlobPattern | null,
        maxResults?: number,
        token?: vscode.CancellationToken
    ): Thenable<vscode.Uri[]>

    saveAll(includeUntitled?: boolean): Thenable<boolean>

    applyEdit(edit: vscode.WorkspaceEdit): Thenable<boolean>

    openTextDocument(uri: vscode.Uri): Thenable<vscode.TextDocument>
    openTextDocument(fileName: string): Thenable<vscode.TextDocument>
    openTextDocument(
        options?: {
            language?: string
            content?: string
        }
    ): Thenable<vscode.TextDocument>

    registerTextDocumentContentProvider(
        scheme: string,
        provider: vscode.TextDocumentContentProvider
    ): vscode.Disposable

    getConfiguration(
        section?: string,
        resource?: vscode.Uri | null
    ): vscode.WorkspaceConfiguration

    registerFileSystemProvider(
        scheme: string,
        provider: vscode.FileSystemProvider,
        options?: { isCaseSensitive?: boolean, isReadonly?: boolean }
    ): vscode.Disposable
}
