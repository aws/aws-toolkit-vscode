/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { WindowNamespace } from '..'

export class DefaultWindowNamespace implements WindowNamespace {
    public get onDidChangeActiveTextEditor(): vscode.Event<vscode.TextEditor | undefined> {
        return vscode.window.onDidChangeActiveTextEditor
    }

    public get onDidChangeVisibleTextEditors(): vscode.Event<vscode.TextEditor[]> {
        return vscode.window.onDidChangeVisibleTextEditors
    }

    public get onDidChangeTextEditorSelection(): vscode.Event<vscode.TextEditorSelectionChangeEvent> {
        return vscode.window.onDidChangeTextEditorSelection
    }

    public get onDidChangeTextEditorVisibleRanges(): vscode.Event<vscode.TextEditorVisibleRangesChangeEvent> {
        return vscode.window.onDidChangeTextEditorVisibleRanges
    }

    public get onDidChangeTextEditorOptions(): vscode.Event<vscode.TextEditorOptionsChangeEvent> {
        return vscode.window.onDidChangeTextEditorOptions
    }

    public get onDidChangeTextEditorViewColumn(): vscode.Event<vscode.TextEditorViewColumnChangeEvent> {
        return vscode.window.onDidChangeTextEditorViewColumn
    }

    public get terminals(): ReadonlyArray<vscode.Terminal> {
        return vscode.window.terminals
    }

    public get onDidOpenTerminal(): vscode.Event<vscode.Terminal> {
        return vscode.window.onDidOpenTerminal
    }

    public get onDidCloseTerminal(): vscode.Event<vscode.Terminal> {
        return vscode.window.onDidCloseTerminal
    }

    public get onDidChangeWindowState(): vscode.Event<vscode.WindowState> {
        return vscode.window.onDidChangeWindowState
    }

    public get activeTextEditor(): vscode.TextEditor | undefined {
        return vscode.window.activeTextEditor
    }
    public set activeTextEditor(value: vscode.TextEditor | undefined) {
        vscode.window.activeTextEditor = value
    }

    public get visibleTextEditors(): vscode.TextEditor[] {
        return vscode.window.visibleTextEditors
    }
    public set visibleTextEditors(value: vscode.TextEditor[]) {
        vscode.window.visibleTextEditors = value
    }

    public get state(): vscode.WindowState {
        return vscode.window.state
    }
    public set state(value: vscode.WindowState) {
        vscode.window.state = value
    }

    public showTextDocument(
        document: vscode.TextDocument,
        column?: vscode.ViewColumn,
        preserveFocus?: boolean
    ): Thenable<vscode.TextEditor>
    public showTextDocument(
        document: vscode.TextDocument,
        options?: vscode.TextDocumentShowOptions
    ): Thenable<vscode.TextEditor>
    public showTextDocument(
        uri: vscode.Uri,
        options?: vscode.TextDocumentShowOptions
    ): Thenable<vscode.TextEditor>
    public showTextDocument(
        documentOrUri: vscode.TextDocument | vscode.Uri,
        columnOrOptions?: vscode.ViewColumn | vscode.TextDocumentShowOptions,
        preserveFocus?: boolean
    ): Thenable<vscode.TextEditor> {
        if (documentOrUri instanceof vscode.Uri) {
            return vscode.window.showTextDocument(
                documentOrUri as vscode.Uri,
                columnOrOptions as vscode.TextDocumentShowOptions | undefined
            )
        }

        if (typeof columnOrOptions === 'number') {
            return vscode.window.showTextDocument(
                documentOrUri as vscode.TextDocument,
                columnOrOptions as vscode.ViewColumn,
                preserveFocus
            )
        }

        return vscode.window.showTextDocument(
            documentOrUri as vscode.TextDocument,
            columnOrOptions as vscode.TextDocumentShowOptions | undefined
        )
    }

    public createTextEditorDecorationType(options: vscode.DecorationRenderOptions): vscode.TextEditorDecorationType {
        return vscode.window.createTextEditorDecorationType(options)
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
        const actualItems: (T | string)[] =
            items.length > 0 ? items : (optionsOrItems as (T | string)[])
        const actualOptions: vscode.MessageOptions | undefined =
            items.length > 0 ? optionsOrItems as vscode.MessageOptions : undefined

        if (actualItems.some(() => true)) {
            return !!actualOptions ?
                vscode.window.showInformationMessage(
                    message,
                    actualOptions,
                    ...actualItems as string[]
                ) :
                vscode.window.showInformationMessage(
                    message,
                    ...actualItems as string[]
                )
        }

        return !!actualOptions ?
            vscode.window.showInformationMessage(
                message,
                actualOptions,
                ...actualItems as T[]
            ) :
            vscode.window.showInformationMessage(
                message,
                ...actualItems as T[]
            )
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
        const actualItems: (T | string)[] =
            items.length > 0 ? items : (optionsOrItems as (T | string)[])
        const actualOptions: vscode.MessageOptions | undefined =
            items.length > 0 ? optionsOrItems as vscode.MessageOptions : undefined

        if (actualItems.some(() => true)) {
            return !!actualOptions ?
                vscode.window.showWarningMessage(
                    message,
                    actualOptions,
                    ...actualItems as string[]
                ) :
                vscode.window.showWarningMessage(
                    message,
                    ...actualItems as string[]
                )
        }

        return !!actualOptions ?
            vscode.window.showWarningMessage(
                message,
                actualOptions,
                ...actualItems as T[]
            ) :
            vscode.window.showWarningMessage(
                message,
                ...actualItems as T[]
            )
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
        const actualItems: (T | string)[] =
            items.length > 0 ? items : (optionsOrItems as (T | string)[])
        const actualOptions: vscode.MessageOptions | undefined =
            items.length > 0 ? optionsOrItems as vscode.MessageOptions : undefined

        if (actualItems.some(() => true)) {
            return !!actualOptions ?
                vscode.window.showErrorMessage(
                    message,
                    actualOptions,
                    ...actualItems as string[]
                ) :
                vscode.window.showErrorMessage(
                    message,
                    ...actualItems as string[]
                )
        }

        return !!actualOptions ?
            vscode.window.showErrorMessage(
                message,
                actualOptions,
                ...actualItems as T[]
            ) :
            vscode.window.showErrorMessage(
                message,
                ...actualItems as T[]
            )
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
    public async showQuickPick<T extends vscode.QuickPickItem>(
        items: string[] | T[] | Thenable<string[] | T[]>,
        options:
            vscode.QuickPickOptions |
            (vscode.QuickPickOptions & { canPickMany: true }),
        token?: vscode.CancellationToken
    ): Promise<string | string[] | T | T[] | undefined> {
        // We can't tell the difference between Thenable<string[]> and Thenable<T[]> without
        // resolving the thenable. Therefore we have to resolve the promise here, instead
        // of deferring to vscode.window.showQuickPick.
        const resolvedItems: (string | T)[] = await Promise.resolve(items)

        if (resolvedItems.some(i => typeof i === 'string')) {
            return vscode.window.showQuickPick(resolvedItems as string[], options, token)
        }

        return vscode.window.showQuickPick(resolvedItems as T[], options, token)
    }

    public showWorkspaceFolderPick(
        options?: vscode.WorkspaceFolderPickOptions
    ): Thenable<vscode.WorkspaceFolder | undefined> {
        return vscode.window.showWorkspaceFolderPick(options)
    }

    public showOpenDialog(options: vscode.OpenDialogOptions): Thenable<vscode.Uri[] | undefined> {
        return vscode.window.showOpenDialog(options)
    }

    public showSaveDialog(options: vscode.SaveDialogOptions): Thenable<vscode.Uri | undefined> {
        return vscode.window.showSaveDialog(options)
    }

    public showInputBox(
        options?: vscode.InputBoxOptions,
        token?: vscode.CancellationToken
    ): Thenable<string | undefined> {
        return vscode.window.showInputBox(options, token)
    }

    public createQuickPick<T extends vscode.QuickPickItem>(): vscode.QuickPick<T> {
        return vscode.window.createQuickPick()
    }

    public createInputBox(): vscode.InputBox {
        return vscode.window.createInputBox()
    }

    public createOutputChannel(name: string): vscode.OutputChannel {
        return vscode.window.createOutputChannel(name)
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
        return vscode.window.createWebviewPanel(viewType, title, showOptions, options)
    }

    public setStatusBarMessage(text: string, hideAfterTimeout: number): vscode.Disposable
    public setStatusBarMessage(text: string, hideWhenDone: Thenable<any>): vscode.Disposable
    public setStatusBarMessage(text: string): vscode.Disposable
    public setStatusBarMessage(text: string, option?: number | Thenable<any>): vscode.Disposable {
        if (!option) {
            return vscode.window.setStatusBarMessage(text)
        }

        if (!!(option as Thenable<any>).then) {
            return vscode.window.setStatusBarMessage(text, option as Thenable<any>)
        }

        return vscode.window.setStatusBarMessage(text, option as number)
    }

    public withScmProgress<R>(task: (progress: vscode.Progress<number>) => Thenable<R>): Thenable<R> {
        throw new Error('`withScmProgress` is deprecated: Use `withProgress` instead')
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
        return vscode.window.withProgress(options, task)
    }

    public createStatusBarItem(
        alignment?: vscode.StatusBarAlignment,
        priority?: number
    ): vscode.StatusBarItem {
        return vscode.window.createStatusBarItem(alignment, priority)
    }

    public createTerminal(
        name?: string,
        shellPath?: string,
        shellArgs?: string[]
    ): vscode.Terminal
    public createTerminal(
        options: vscode.TerminalOptions
    ): vscode.Terminal
    public createTerminal(
        nameOrOptions?: string | vscode.TerminalOptions,
        shellPath?: string,
        shellArgs?: string[]
    ): vscode.Terminal {
        if (!nameOrOptions || typeof nameOrOptions === 'string') {
            return vscode.window.createTerminal(nameOrOptions as string, shellPath, shellArgs)
        }

        return vscode.window.createTerminal(nameOrOptions as vscode.TerminalOptions)
    }

    public registerTreeDataProvider<T>(
        viewId: string,
        treeDataProvider: vscode.TreeDataProvider<T>
    ): vscode.Disposable {
        return vscode.window.registerTreeDataProvider(viewId, treeDataProvider)
    }

    public createTreeView<T>(
        viewId: string,
        options: { treeDataProvider: vscode.TreeDataProvider<T> }
    ): vscode.TreeView<T> {
        return vscode.window.createTreeView(viewId, options)
    }

    public registerUriHandler(handler: vscode.UriHandler): vscode.Disposable {
        return vscode.window.registerUriHandler(handler)
    }

    public registerWebviewPanelSerializer(
        viewType: string,
        serializer: vscode.WebviewPanelSerializer
    ): vscode.Disposable {
        return vscode.window.registerWebviewPanelSerializer(viewType, serializer)
    }
}
