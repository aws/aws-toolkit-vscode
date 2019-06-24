/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as del from 'del'
import * as fs from 'fs'
import * as vscode from 'vscode'
import { makeTemporaryToolkitFolder } from '../filesystemUtilities'
import { getLogger, Logger } from '../logger'

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
        const logger: Logger = getLogger()
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
                logger.error('Error during DisposableFiles dispose: ', err as Error)
            } finally {
                this._disposed = true
            }
        }
    }
}

export class ExtensionDisposableFiles extends DisposableFiles {
    protected static INSTANCE?: ExtensionDisposableFiles

    protected constructor(
        public readonly toolkitTempFolder: string
    ) {
        super()

        this.addFolder(this.toolkitTempFolder)
    }

    public static async initialize(
        extensionContext: vscode.ExtensionContext
    ): Promise<void> {
        if (!!ExtensionDisposableFiles.INSTANCE) {
            throw new Error('ExtensionDisposableFiles already initialized')
        }

        const toolkitTempFolder: string = await makeTemporaryToolkitFolder()

        ExtensionDisposableFiles.INSTANCE = new ExtensionDisposableFiles(toolkitTempFolder)

        extensionContext.subscriptions.push(ExtensionDisposableFiles.INSTANCE)
    }

    public static getInstance(): ExtensionDisposableFiles {
        if (!ExtensionDisposableFiles.INSTANCE) {
            throw new Error('ExtensionDisposableFiles not initialized')
        }

        return ExtensionDisposableFiles.INSTANCE
    }
}
