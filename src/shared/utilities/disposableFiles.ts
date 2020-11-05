/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { makeTemporaryToolkitFolder } from '../filesystemUtilities'
import { removeSync } from 'fs-extra'
import { getLogger } from '../logger'

export class DisposableFiles implements vscode.Disposable {
    private _disposed: boolean = false
    private readonly _filePaths: Set<string> = new Set<string>()
    private readonly _folderPaths: Set<string> = new Set<string>()

    public addFile(file: string): DisposableFiles {
        this._filePaths.add(file)

        return this
    }

    public addFolder(file: string): DisposableFiles {
        this._folderPaths.add(file)

        return this
    }

    public isDisposed(): boolean {
        return this._disposed
    }

    public dispose(): void {
        if (this._disposed) {
            return
        }

        try {
            this._filePaths.forEach(file => {
                removeSync(file)
            })
            this._folderPaths.forEach(folder => {
                removeSync(folder)
            })
        } catch (err) {
            getLogger().error('Error during DisposableFiles dispose: %O', err as Error)
        } finally {
            this._disposed = true
        }
    }
}

export class ExtensionDisposableFiles extends DisposableFiles {
    protected static INSTANCE?: ExtensionDisposableFiles

    protected constructor(public readonly toolkitTempFolder: string) {
        super()

        this.addFolder(this.toolkitTempFolder)
    }

    public static async initialize(extensionContext: vscode.ExtensionContext): Promise<void> {
        if (ExtensionDisposableFiles.INSTANCE && !ExtensionDisposableFiles.INSTANCE.isDisposed()) {
            throw new Error('ExtensionDisposableFiles already initialized')
        }

        const toolkitTempFolder: string = await makeTemporaryToolkitFolder()

        ExtensionDisposableFiles.INSTANCE = new ExtensionDisposableFiles(toolkitTempFolder)

        extensionContext.subscriptions.push(ExtensionDisposableFiles.INSTANCE)
    }

    public static getInstance(): ExtensionDisposableFiles {
        if (!ExtensionDisposableFiles.INSTANCE || ExtensionDisposableFiles.INSTANCE.isDisposed()) {
            throw new Error('ExtensionDisposableFiles not initialized')
        }

        return ExtensionDisposableFiles.INSTANCE
    }
}
