/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as del from 'del'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import * as filesystem from '../filesystem'

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

    public dispose(): void {
        if (!this._disposed) {
            try {
                del.sync(
                    [...this._filePaths],
                    {
                        absolute: true,
                        force: true,
                        nobrace: false,
                        nodir: true,
                        noext: true,
                        noglobstar: true,
                    })

                this._folderPaths.forEach(folder => {
                    if (fs.existsSync(folder)) {
                        del.sync(
                            folder,
                            {
                                absolute: true,
                                force: true,
                                nobrace: false,
                                nodir: false,
                                noext: true,
                                noglobstar: true,
                            })
                    }
                })
            } catch (err) {
                console.error('Error during DisposableFiles dispose', err)
            } finally {
                this._disposed = true
            }
        }
    }
}

export class ExtensionDisposableFiles {
    protected static INSTANCE: DisposableFiles = new DisposableFiles()
    protected static TOOLKIT_SESSION_DISPOSABLE_TEMP_FOLDER: string | undefined

    public static async initialize(
        extensionContext: vscode.ExtensionContext
    ): Promise<void> {
        if (!!ExtensionDisposableFiles.TOOLKIT_SESSION_DISPOSABLE_TEMP_FOLDER) {
            throw new Error('ExtensionDisposableFiles already initialized')
        }

        extensionContext.subscriptions.push(ExtensionDisposableFiles.INSTANCE)

        ExtensionDisposableFiles.TOOLKIT_SESSION_DISPOSABLE_TEMP_FOLDER = await filesystem.mkdtempAsync(
            path.join(
                os.tmpdir(),
                'aws-toolkit-vscode-'
            )
        )

        ExtensionDisposableFiles.INSTANCE.addFolder(ExtensionDisposableFiles.TOOLKIT_SESSION_DISPOSABLE_TEMP_FOLDER)
    }

    public static getInstance(): DisposableFiles {
        return ExtensionDisposableFiles.INSTANCE
    }

    public static getToolkitTempFolder(): string {
        if (!ExtensionDisposableFiles.TOOLKIT_SESSION_DISPOSABLE_TEMP_FOLDER) {
            throw new Error('ExtensionDisposableFiles not initialized')
        }

        return ExtensionDisposableFiles.TOOLKIT_SESSION_DISPOSABLE_TEMP_FOLDER
    }
}
