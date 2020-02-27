/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

export interface FileWatcherListener {
    onListenedChange(templateUri: vscode.Uri): void
    onListenedCreate(templateUri: vscode.Uri): void
    onListenedDelete(templateUri: vscode.Uri): void
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
        listener.onListenedChange(filename)
    })
    watcher.onDidCreate(async (filename) => {
        listener.onListenedCreate(filename)
    })
    watcher.onDidDelete(async (filename) => {
        listener.onListenedDelete(filename)
    })

    return watcher
}
