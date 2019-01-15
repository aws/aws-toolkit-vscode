/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { WorkspaceNamespace } from '..'

export class DefaultWorkspaceNamespace implements WorkspaceNamespace {
    public get onDidChangeWorkspaceFolders(): vscode.Event<vscode.WorkspaceFoldersChangeEvent> {
        return vscode.workspace.onDidChangeWorkspaceFolders
    }

    public get onDidOpenTextDocument(): vscode.Event<vscode.TextDocument> {
        return vscode.workspace.onDidOpenTextDocument
    }

    public get onDidCloseTextDocument(): vscode.Event<vscode.TextDocument> {
        return vscode.workspace.onDidCloseTextDocument
    }

    public get onDidChangeTextDocument(): vscode.Event<vscode.TextDocumentChangeEvent> {
        return vscode.workspace.onDidChangeTextDocument
    }

    public get onWillSaveTextDocument(): vscode.Event<vscode.TextDocumentWillSaveEvent> {
        return vscode.workspace.onWillSaveTextDocument
    }

    public get onDidSaveTextDocument(): vscode.Event<vscode.TextDocument> {
        return vscode.workspace.onDidSaveTextDocument
    }

    public get onDidChangeConfiguration(): vscode.Event<vscode.ConfigurationChangeEvent> {
        return vscode.workspace.onDidChangeConfiguration
    }

    public get workspaceFolders(): vscode.WorkspaceFolder[] | undefined {
        return vscode.workspace.workspaceFolders
    }

    public set workspaceFolders(value: vscode.WorkspaceFolder[] | undefined) {
        vscode.workspace.workspaceFolders = value
    }

    public get name(): string | undefined {
        return vscode.workspace.name
    }

    public set name(value: string | undefined) {
        vscode.workspace.name = value
    }

    public get textDocuments(): vscode.TextDocument[] {
        return vscode.workspace.textDocuments
    }

    public set textDocuments(value: vscode.TextDocument[]) {
        vscode.workspace.textDocuments = value
    }

    public getWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
        return vscode.workspace.getWorkspaceFolder(uri)
    }

    public asRelativePath(pathOrUri: string | vscode.Uri, includeWorkspaceFolder?: boolean | undefined): string {
        return vscode.workspace.asRelativePath(pathOrUri, includeWorkspaceFolder)
    }

    public updateWorkspaceFolders(
        start: number,
        deleteCount: number | null | undefined,
        ...workspaceFoldersToAdd: {
            uri: vscode.Uri
            name?: string | undefined
        }[]
    ): boolean {
        return this.updateWorkspaceFolders(start, deleteCount, ...workspaceFoldersToAdd)
    }

    public createFileSystemWatcher(
        globPattern: vscode.GlobPattern,
        ignoreCreateEvents?: boolean | undefined,
        ignoreChangeEvents?: boolean | undefined,
        ignoreDeleteEvents?: boolean | undefined
    ): vscode.FileSystemWatcher {
        return this.createFileSystemWatcher(globPattern, ignoreCreateEvents, ignoreChangeEvents, ignoreDeleteEvents)
    }

    public findFiles(
        include: vscode.GlobPattern,
        exclude?: string | vscode.RelativePattern | null | undefined,
        maxResults?: number | undefined,
        token?: vscode.CancellationToken | undefined
    ): Thenable<vscode.Uri[]> {
        return vscode.workspace.findFiles(include, exclude, maxResults, token)
    }

    public saveAll(includeUntitled?: boolean | undefined): Thenable<boolean> {
        return vscode.workspace.saveAll(includeUntitled)
    }

    public applyEdit(edit: vscode.WorkspaceEdit): Thenable<boolean> {
        return vscode.workspace.applyEdit(edit)
    }

    public openTextDocument(uri: vscode.Uri): Thenable<vscode.TextDocument>
    public openTextDocument(fileName: string): Thenable<vscode.TextDocument>
    public openTextDocument(
        options?: {
            language?: string | undefined
            content?: string | undefined
        } | undefined
    ): Thenable<vscode.TextDocument>
    public openTextDocument(
        options?:
            vscode.Uri |
            string |
            {
                language?: string | undefined
                content?: string | undefined
            } |
            undefined
    ): Thenable<vscode.TextDocument> {
        if (!!options) {
            if (typeof(options) === 'string') {
                return vscode.workspace.openTextDocument(options as string)
            }

            if (options instanceof vscode.Uri) {
                return vscode.workspace.openTextDocument(options as vscode.Uri)
            }
        }

        return vscode.workspace.openTextDocument(
            options as {
                language?: string | undefined,
                content?: string | undefined
            } | undefined
        )
    }

    public registerTextDocumentContentProvider(
        scheme: string,
        provider: vscode.TextDocumentContentProvider
    ): vscode.Disposable {
        return vscode.workspace.registerTextDocumentContentProvider(scheme, provider)
    }

    public getConfiguration(
        section?: string | undefined,
        resource?: vscode.Uri | null | undefined
    ): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration(section, resource)
    }

    public registerFileSystemProvider(
        scheme: string,
        provider: vscode.FileSystemProvider,
        options?: {
            isCaseSensitive?: boolean | undefined
            isReadonly?: boolean | undefined
        } | undefined
    ): vscode.Disposable {
        return vscode.workspace.registerFileSystemProvider(scheme, provider, options)
    }
}
