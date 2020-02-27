/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

/**
 * Interface representing an object that can listen to a vscode.FileSystemWatcher
 */
export interface FileWatcherListener extends vscode.Disposable {
    onListenedChange(templatePath: vscode.Uri): Promise<void>
    onListenedCreate(templatePath: vscode.Uri): Promise<void>
    onListenedDelete(templtemplatePathateUri: vscode.Uri): Promise<void>
}

/**
 * Creates a file watcher that attaches functions to onDidChange, onDidCreate, and onDidDelete functions
 *
 * The resulting file watcher will check the glob pattern across all workspace folders.
 * @param listener FileWatcherListener that includes functions to attach to onEvent hooks
 * @param globPattern Glob pattern to use for file watcher
 */
export function createFileSystemWatcher(
    listener: FileWatcherListener,
    globPattern: string
): vscode.FileSystemWatcher {
    const watcher = vscode.workspace.createFileSystemWatcher(globPattern)
    watcher.onDidChange(async (filename) => {
        await listener.onListenedChange(filename)
    })
    watcher.onDidCreate(async (filename) => {
        await listener.onListenedCreate(filename)
    })
    watcher.onDidDelete(async (filename) => {
        await listener.onListenedDelete(filename)
    })

    return watcher
}
