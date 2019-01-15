/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import {
    types as vscode,
    WorkspaceNamespace
} from '../../../shared/vscode'
import * as mocks from './mockTypes'

export class MockWorkspaceNamespace implements WorkspaceNamespace {
    public readonly onDidChangeWorkspaceFolders: vscode.Event<vscode.WorkspaceFoldersChangeEvent>

    public readonly onDidOpenTextDocument: vscode.Event<vscode.TextDocument>

    public readonly onDidCloseTextDocument: vscode.Event<vscode.TextDocument>

    public readonly onDidChangeTextDocument: vscode.Event<vscode.TextDocumentChangeEvent>

    public readonly onWillSaveTextDocument: vscode.Event<vscode.TextDocumentWillSaveEvent>

    public readonly onDidSaveTextDocument: vscode.Event<vscode.TextDocument>

    public readonly onDidChangeConfiguration: vscode.Event<vscode.ConfigurationChangeEvent>

    public workspaceFolders: vscode.WorkspaceFolder[] | undefined

    public name: string | undefined

    public textDocuments: vscode.TextDocument[] = []

    private readonly onDidChangeWorkspaceFoldersEmitter: vscode.EventEmitter<vscode.WorkspaceFoldersChangeEvent>
    private readonly onDidOpenTextDocumentEmitter: vscode.EventEmitter<vscode.TextDocument>
    private readonly onDidCloseTextDocumentEmitter: vscode.EventEmitter<vscode.TextDocument>
    private readonly onDidChangeTextDocumentEmitter: vscode.EventEmitter<vscode.TextDocumentChangeEvent>
    private readonly onWillSaveTextDocumentEmitter: vscode.EventEmitter<vscode.TextDocumentWillSaveEvent>
    private readonly onDidSaveTextDocumentEmitter: vscode.EventEmitter<vscode.TextDocument>
    private readonly onDidChangeConfigurationEmitter: vscode.EventEmitter<vscode.ConfigurationChangeEvent>

    public constructor() {
        this.onDidChangeWorkspaceFoldersEmitter = new mocks.MockEventEmitter()
        this.onDidOpenTextDocumentEmitter = new mocks.MockEventEmitter()
        this.onDidCloseTextDocumentEmitter = new mocks.MockEventEmitter()
        this.onDidChangeTextDocumentEmitter = new mocks.MockEventEmitter()
        this.onWillSaveTextDocumentEmitter = new mocks.MockEventEmitter()
        this.onDidSaveTextDocumentEmitter = new mocks.MockEventEmitter()
        this.onDidChangeConfigurationEmitter = new mocks.MockEventEmitter()

        this.onDidChangeWorkspaceFolders = this.onDidChangeWorkspaceFoldersEmitter.event.bind(
            this.onDidChangeWorkspaceFoldersEmitter
        ) as vscode.Event<vscode.WorkspaceFoldersChangeEvent>
        this.onDidOpenTextDocument = this.onDidOpenTextDocumentEmitter.event.bind(
            this.onDidOpenTextDocumentEmitter
        ) as vscode.Event<vscode.TextDocument>
        this.onDidCloseTextDocument = this.onDidCloseTextDocumentEmitter.event.bind(
            this.onDidCloseTextDocumentEmitter
        ) as vscode.Event<vscode.TextDocument>
        this.onDidChangeTextDocument = this.onDidChangeTextDocumentEmitter.event.bind(
            this.onDidChangeTextDocumentEmitter
        ) as vscode.Event<vscode.TextDocumentChangeEvent>
        this.onWillSaveTextDocument = this.onWillSaveTextDocumentEmitter.event.bind(
            this.onWillSaveTextDocumentEmitter
        ) as vscode.Event<vscode.TextDocumentWillSaveEvent>
        this.onDidSaveTextDocument = this.onDidSaveTextDocumentEmitter.event.bind(
            this.onDidSaveTextDocumentEmitter
        ) as vscode.Event<vscode.TextDocument>
        this.onDidChangeConfiguration = this.onDidChangeConfigurationEmitter.event.bind(
            this.onDidChangeConfigurationEmitter
        ) as vscode.Event<vscode.ConfigurationChangeEvent>
    }

    public getWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
        throw new Error('Not Implemented')
    }

    public asRelativePath(pathOrUri: string | vscode.Uri, includeWorkspaceFolder?: boolean): string {
        throw new Error('Not Implemented')
    }

    public updateWorkspaceFolders(
        start: number,
        deleteCount: number | undefined | null,
        ...workspaceFoldersToAdd: {
            uri: vscode.Uri
            name?: string
        }[]
    ): boolean {
        throw new Error('Not Implemented')
    }

    public createFileSystemWatcher(
        globPattern: vscode.GlobPattern,
        ignoreCreateEvents?: boolean,
        ignoreChangeEvents?: boolean,
        ignoreDeleteEvents?: boolean
    ): vscode.FileSystemWatcher {
        throw new Error('Not Implemented')
    }

    public findFiles(
        include: vscode.GlobPattern,
        exclude?: vscode.GlobPattern | null,
        maxResults?: number,
        token?: vscode.CancellationToken
    ): Thenable<vscode.Uri[]> {
        throw new Error('Not Implemented')
    }

    public saveAll(includeUntitled?: boolean): Thenable<boolean> {
        throw new Error('Not Implemented')
    }

    public applyEdit(edit: vscode.WorkspaceEdit): Thenable<boolean> {
        throw new Error('Not Implemented')
    }

    public openTextDocument(uri: vscode.Uri): Thenable<vscode.TextDocument>
    public openTextDocument(fileName: string): Thenable<vscode.TextDocument>
    public openTextDocument(
        options?: {
            language?: string
            content?: string
        }
    ): Thenable<vscode.TextDocument>
    public openTextDocument(
        uriOrFileNameOrOptions?: vscode.Uri | string | {
            language?: string
            content?: string
        }
    ): Thenable<vscode.TextDocument> {
        throw new Error('Not Implemented')
    }

    public registerTextDocumentContentProvider(
        scheme: string,
        provider: vscode.TextDocumentContentProvider
    ): vscode.Disposable {
        throw new Error('Not Implemented')
    }

    public getConfiguration(
        section?: string,
        resource?: vscode.Uri | null
    ): vscode.WorkspaceConfiguration {
        return new mocks.MockWorkspaceConfiguration()
    }

    public registerFileSystemProvider(
        scheme: string,
        provider: vscode.FileSystemProvider,
        options?: { isCaseSensitive?: boolean, isReadonly?: boolean }
    ): vscode.Disposable {
        throw new Error('Not Implemented')
    }
}
