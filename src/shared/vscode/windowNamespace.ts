/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from './types'

export interface WindowNamespace {

    readonly onDidChangeActiveTextEditor: vscode.Event<vscode.TextEditor | undefined>

    readonly onDidChangeVisibleTextEditors: vscode.Event<vscode.TextEditor[]>

    readonly onDidChangeTextEditorSelection: vscode.Event<vscode.TextEditorSelectionChangeEvent>

    readonly onDidChangeTextEditorVisibleRanges:
        vscode.Event<vscode.TextEditorVisibleRangesChangeEvent>

    readonly onDidChangeTextEditorOptions: vscode.Event<vscode.TextEditorOptionsChangeEvent>

    readonly onDidChangeTextEditorViewColumn: vscode.Event<vscode.TextEditorViewColumnChangeEvent>

    readonly terminals: ReadonlyArray<vscode.Terminal>

    readonly onDidOpenTerminal: vscode.Event<vscode.Terminal>

    readonly onDidCloseTerminal: vscode.Event<vscode.Terminal>

    readonly onDidChangeWindowState: vscode.Event<vscode.WindowState>

    activeTextEditor: vscode.TextEditor | undefined

    visibleTextEditors: vscode.TextEditor[]

    state: vscode.WindowState

    showTextDocument(
        document: vscode.TextDocument,
        column?: vscode.ViewColumn,
        preserveFocus?: boolean
    ): Thenable<vscode.TextEditor>

    showTextDocument(
        document: vscode.TextDocument,
        options?: vscode.TextDocumentShowOptions
    ): Thenable<vscode.TextEditor>

    showTextDocument(uri: vscode.Uri, options?:
        vscode.TextDocumentShowOptions): Thenable<vscode.TextEditor>

    createTextEditorDecorationType(
        options: vscode.DecorationRenderOptions
    ): vscode.TextEditorDecorationType

    showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>

    showInformationMessage(
        message: string,
        options: vscode.MessageOptions,
        ...items: string[]
    ): Thenable<string | undefined>

    showInformationMessage<T extends vscode.MessageItem>(
        message: string,
        ...items: T[]
    ): Thenable<T | undefined>

    showInformationMessage<T extends vscode.MessageItem>(
        message: string,
        options: vscode.MessageOptions,
        ...items: T[]
    ): Thenable<T | undefined>

    showWarningMessage(message: string, ...items: string[]): Thenable<string | undefined>

    showWarningMessage(
        message: string,
        options: vscode.MessageOptions,
        ...items: string[]
    ): Thenable<string | undefined>

    showWarningMessage<T extends vscode.MessageItem>(message: string, ...items: T[]): Thenable<T | undefined>

    showWarningMessage<T extends vscode.MessageItem>(
        message: string,
        options: vscode.MessageOptions,
        ...items: T[]
    ): Thenable<T | undefined>

    showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined>

    showErrorMessage(
        message: string,
        options: vscode.MessageOptions,
        ...items: string[]
    ): Thenable<string | undefined>

    showErrorMessage<T extends vscode.MessageItem>(
        message: string,
        ...items: T[]
    ): Thenable<T | undefined>

    showErrorMessage<T extends vscode.MessageItem>(
        message: string,
        options: vscode.MessageOptions,
        ...items: T[]
    ): Thenable<T | undefined>

    showQuickPick(
        items: string[] | Thenable<string[]>,
        options:
        vscode.QuickPickOptions &
            { canPickMany: true },
        token?: vscode.CancellationToken
    ): Thenable<string[] | undefined>

    showQuickPick(
        items: string[] | Thenable<string[]>,
        options?: vscode.QuickPickOptions,
        token?: vscode.CancellationToken
    ): Thenable<string | undefined>

    showQuickPick<T extends vscode.QuickPickItem>(
        items: T[] | Thenable<T[]>,
        options:
        vscode.QuickPickOptions &
            { canPickMany: true; },
        token?: vscode.CancellationToken
    ): Thenable<T[] | undefined>

    showQuickPick<T extends vscode.QuickPickItem>(
        items: T[] | Thenable<T[]>,
        options?: vscode.QuickPickOptions,
        token?: vscode.CancellationToken
    ): Thenable<T | undefined>

    showWorkspaceFolderPick(
        options?: vscode.WorkspaceFolderPickOptions
    ): Thenable<vscode.WorkspaceFolder | undefined>

    showOpenDialog(
        options: vscode.OpenDialogOptions
    ): Thenable<vscode.Uri[] | undefined>

    showSaveDialog(
        options: vscode.SaveDialogOptions
    ): Thenable<vscode.Uri | undefined>

    showInputBox(
        options?: vscode.InputBoxOptions,
        token?: vscode.CancellationToken
    ): Thenable<string | undefined>

    createQuickPick<T extends vscode.QuickPickItem>(): vscode.QuickPick<T>

    createInputBox(): vscode.InputBox

    createOutputChannel(name: string): vscode.OutputChannel

    createWebviewPanel(
        viewType: string,
        title: string,
        showOptions:
        vscode.ViewColumn |
            {
                viewColumn: vscode.ViewColumn
                preserveFocus?: boolean
            },
        options?: vscode.WebviewPanelOptions & vscode.WebviewOptions
    ): vscode.WebviewPanel

    setStatusBarMessage(text: string, hideAfterTimeout: number): vscode.Disposable

    setStatusBarMessage(text: string, hideWhenDone: Thenable<any>): vscode.Disposable

    setStatusBarMessage(text: string): vscode.Disposable

    withScmProgress<R>(task: (progress: vscode.Progress<number>) => Thenable<R>): Thenable<R>

    withProgress<R>(
        options: vscode.ProgressOptions,
        task: (
            progress: vscode.Progress<{
                message?: string
                increment?: number
            }>,
            token: vscode.CancellationToken
        ) => Thenable<R>
    ): Thenable<R>

    createStatusBarItem(
        alignment?: vscode.StatusBarAlignment,
        priority?: number
    ): vscode.StatusBarItem

    createTerminal(name?: string, shellPath?: string, shellArgs?: string[]): vscode.Terminal

    createTerminal(options: vscode.TerminalOptions): vscode.Terminal

    registerTreeDataProvider<T>(
        viewId: string,
        treeDataProvider: vscode.TreeDataProvider<T>
    ): vscode.Disposable

    createTreeView<T>(
        viewId: string,
        options: { treeDataProvider: vscode.TreeDataProvider<T> }
    ): vscode.TreeView<T>

    registerUriHandler(handler: vscode.UriHandler): vscode.Disposable

    registerWebviewPanelSerializer(
        viewType: string,
        serializer: vscode.WebviewPanelSerializer
    ): vscode.Disposable
}
