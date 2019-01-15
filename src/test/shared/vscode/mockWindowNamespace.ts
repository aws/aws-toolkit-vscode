/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import {
    types as vscode,
    WindowNamespace
} from '../../../shared/vscode'
import { MockProgress, MockWebviewPanel } from './mockTypes'
import { createMockEvent } from './utils'

export class MockWindowNamespace implements WindowNamespace {
    public readonly onDidChangeActiveTextEditor: vscode.Event<vscode.TextEditor | undefined> =
        createMockEvent()

    public readonly onDidChangeVisibleTextEditors: vscode.Event<vscode.TextEditor[]> =
        createMockEvent()

    public readonly onDidChangeTextEditorSelection: vscode.Event<vscode.TextEditorSelectionChangeEvent> =
        createMockEvent()

    public readonly onDidChangeTextEditorVisibleRanges: vscode.Event<vscode.TextEditorVisibleRangesChangeEvent> =
        createMockEvent()

    public readonly onDidChangeTextEditorOptions: vscode.Event<vscode.TextEditorOptionsChangeEvent> =
        createMockEvent()

    public readonly onDidChangeTextEditorViewColumn: vscode.Event<vscode.TextEditorViewColumnChangeEvent> =
        createMockEvent()

    public readonly terminals: ReadonlyArray<vscode.Terminal> = []

    public readonly onDidOpenTerminal: vscode.Event<vscode.Terminal> = createMockEvent()

    public readonly onDidCloseTerminal: vscode.Event<vscode.Terminal> = createMockEvent()

    public readonly onDidChangeWindowState: vscode.Event<vscode.WindowState> = createMockEvent()

    public activeTextEditor: vscode.TextEditor | undefined

    public visibleTextEditors: vscode.TextEditor[] = []

    public state: vscode.WindowState = { focused: true }

    public showTextDocument(
        document: vscode.TextDocument,
        column?: vscode.ViewColumn,
        preserveFocus?: boolean
    ): Thenable<vscode.TextEditor>
    public showTextDocument(
        document: vscode.TextDocument,
        options?: vscode.TextDocumentShowOptions
    ): Thenable<vscode.TextEditor>
    public showTextDocument(uri: vscode.Uri, options?: vscode.TextDocumentShowOptions): Thenable<vscode.TextEditor>
    public showTextDocument(
        documentOrUri: vscode.TextDocument | vscode.Uri,
        columnOrOptions?: vscode.ViewColumn | vscode.TextDocumentShowOptions,
        preserveFocus?: boolean
    ): Thenable<vscode.TextEditor> {
        throw new Error('Not Implemented')
    }

    public createTextEditorDecorationType(options: vscode.DecorationRenderOptions): vscode.TextEditorDecorationType {
        throw new Error('Not Implemented')
    }

    public showInformationMessage(
        message: string,
        ...items: string[]
    ): Thenable<string | undefined>
    public showInformationMessage(
        message: string,
        options: vscode.MessageOptions,
        ...items: string[]
    ): Thenable<string | undefined>
    public showInformationMessage<T extends vscode.MessageItem>(
        message: string,
        ...items: T[]
    ): Thenable<T | undefined>
    public showInformationMessage<T extends vscode.MessageItem>(
        message: string,
        options: vscode.MessageOptions,
        ...items: T[]
    ): Thenable<T | undefined>
    public showInformationMessage<T extends vscode.MessageItem>(
        message: string,
        optionsOrItems: vscode.MessageOptions | T[] | string[],
        ...items: T[] | string[]
    ): Thenable<string | T | undefined> {
        throw new Error('Not Implemented')
    }

    public showWarningMessage(
        message: string,
        ...items: string[]
    ): Thenable<string | undefined>
    public showWarningMessage(
        message: string,
        options: vscode.MessageOptions,
        ...items: string[]
    ): Thenable<string | undefined>
    public showWarningMessage<T extends vscode.MessageItem>(
        message: string,
        ...items: T[]
    ): Thenable<T | undefined>
    public showWarningMessage<T extends vscode.MessageItem>(
        message: string,
        options: vscode.MessageOptions,
        ...items: T[]
    ): Thenable<T | undefined>
    public showWarningMessage<T extends vscode.MessageItem>(
        message: string,
        optionsOrItems: vscode.MessageOptions | T[] | string[],
        ...items: T[] | string[]
    ): Thenable<string | T | undefined> {
        throw new Error('Not Implemented')
    }

    public showErrorMessage(
        message: string,
        ...items: string[]
    ): Thenable<string | undefined>
    public showErrorMessage(
        message: string,
        options: vscode.MessageOptions,
        ...items: string[]
    ): Thenable<string | undefined>
    public showErrorMessage<T extends vscode.MessageItem>(
        message: string,
        ...items: T[]
    ): Thenable<T | undefined>
    public showErrorMessage<T extends vscode.MessageItem>(
        message: string,
        options: vscode.MessageOptions,
        ...items: T[]
    ): Thenable<T | undefined>
    public showErrorMessage<T extends vscode.MessageItem>(
        message: string,
        optionsOrItems: vscode.MessageOptions | T[] | string[],
        ...items: T[] | string[]
    ): Thenable<string | T | undefined> {
        throw new Error('Not Implemented')
    }

    public showQuickPick(
        items: string[] | Thenable<string[]>,
        options:
        vscode.QuickPickOptions &
            { canPickMany: true },
        token?: vscode.CancellationToken
    ): Thenable<string[] | undefined>
    public showQuickPick(
        items: string[] | Thenable<string[]>,
        options?: vscode.QuickPickOptions,
        token?: vscode.CancellationToken
    ): Thenable<string | undefined>
    public showQuickPick<T extends vscode.QuickPickItem>(
        items: T[] | Thenable<T[]>,
        options:
        vscode.QuickPickOptions &
            { canPickMany: true; },
        token?: vscode.CancellationToken
    ): Thenable<T[] | undefined>
    public showQuickPick<T extends vscode.QuickPickItem>(
        items: T[] | Thenable<T[]>,
        options?: vscode.QuickPickOptions,
        token?: vscode.CancellationToken
    ): Thenable<T | undefined>
    public showQuickPick<T extends vscode.QuickPickItem>(
        items: string[] | T[] | Thenable<string[] | T[]>,
        options:
            vscode.QuickPickOptions |
            (vscode.QuickPickOptions & { canPickMany: true }),
        token?: vscode.CancellationToken
    ): Thenable<string | string[] | T | T[] | undefined> {
        throw new Error('Not Implemented')
    }

    public showWorkspaceFolderPick(
        options?: vscode.WorkspaceFolderPickOptions
    ): Thenable<vscode.WorkspaceFolder | undefined> {
        throw new Error('Not Implemented')
    }

    public showOpenDialog(
        options: vscode.OpenDialogOptions
    ): Thenable<vscode.Uri[] | undefined> {
        throw new Error('Not Implemented')
    }

    public showSaveDialog(
        options: vscode.SaveDialogOptions
    ): Thenable<vscode.Uri | undefined> {
        throw new Error('Not Implemented')
    }

    public showInputBox(
        options?: vscode.InputBoxOptions,
        token?: vscode.CancellationToken
    ): Thenable<string | undefined> {
        throw new Error('Not Implemented')
    }

    public createQuickPick<T extends vscode.QuickPickItem>(): vscode.QuickPick<T> {
        throw new Error('Not Implemented')
    }

    public createInputBox(): vscode.InputBox {
        throw new Error('Not Implemented')
    }

    public createOutputChannel(name: string): vscode.OutputChannel {
        throw new Error('Not Implemented')
    }

    public createWebviewPanel(
        viewType: string,
        title: string,
        showOptions:
            vscode.ViewColumn |
            {
                viewColumn: vscode.ViewColumn
                preserveFocus?: boolean
            },
        options?: vscode.WebviewPanelOptions & vscode.WebviewOptions
    ): vscode.WebviewPanel {
        return new MockWebviewPanel(
            viewType,
            title,
            undefined,
            undefined,
            options,
            !!(showOptions as { viewColumn: vscode.ViewColumn }).viewColumn ?
                (showOptions as { viewColumn: vscode.ViewColumn }).viewColumn :
                showOptions as vscode.ViewColumn
        )
    }

    public setStatusBarMessage(text: string, hideAfterTimeout: number): vscode.Disposable
    public setStatusBarMessage(text: string, hideWhenDone: Thenable<any>): vscode.Disposable
    public setStatusBarMessage(text: string): vscode.Disposable
    public setStatusBarMessage(
        text: string,
        hideAfterTimeoutOrHideWhenDone?: number | Thenable<any>
    ): vscode.Disposable {
        return { dispose: () => {} }
    }

    public withScmProgress<R>(task: (progress: vscode.Progress<number>) => Thenable<R>): Thenable<R> {
        return Promise.resolve(task(new MockProgress()))
        throw new Error('Not Implemented')
    }

    public withProgress<R>(
        options: vscode.ProgressOptions,
        task: (
            progress: vscode.Progress<{
                message?: string
                increment?: number
            }>,
            token: vscode.CancellationToken
        ) => Thenable<R>
    ): Thenable<R> {
        throw new Error('Not Implemented')
    }

    public createStatusBarItem(
        alignment?: vscode.StatusBarAlignment,
        priority?: number
    ): vscode.StatusBarItem {
        throw new Error('Not Implemented')
    }

    public createTerminal(name?: string, shellPath?: string, shellArgs?: string[]): vscode.Terminal
    public createTerminal(options: vscode.TerminalOptions): vscode.Terminal
    public createTerminal(
        nameOrOptions?: string | vscode.TerminalOptions,
        shellPath?: string,
        shellArgs?: string[]
    ): vscode.Terminal {
        throw new Error('Not Implemented')
    }

    public registerTreeDataProvider<T>(
        viewId: string,
        treeDataProvider: vscode.TreeDataProvider<T>
    ): vscode.Disposable {
        throw new Error('Not Implemented')
    }

    public createTreeView<T>(
        viewId: string,
        options: { treeDataProvider: vscode.TreeDataProvider<T> }
    ): vscode.TreeView<T> {
        throw new Error('Not Implemented')
    }

    public registerUriHandler(handler: vscode.UriHandler): vscode.Disposable {
        throw new Error('Not Implemented')
    }

    public registerWebviewPanelSerializer(
        viewType: string,
        serializer: vscode.WebviewPanelSerializer
    ): vscode.Disposable {
        throw new Error('Not Implemented')
    }
}
