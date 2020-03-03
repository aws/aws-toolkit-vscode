/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CloudFormationTemplateRegistry } from './templateRegistry'

export class CloudFormationTemplateRegistryManager implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = []
    private _isDisposed: boolean = false
    private currGlob: vscode.GlobPattern = ''

    public constructor(private readonly registry: CloudFormationTemplateRegistry) {
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(async () => {
                await this.rebuildRegistry()
            })
        )
    }

    /**
     * Sets the glob pattern to use for lookups and resets the registry to use it.
     * Throws an error if this manager has already been disposed
     * @param glob vscode.GlobPattern used for lookups
     */
    public async setTemplateGlob(glob: vscode.GlobPattern): Promise<void> {
        if (this._isDisposed) {
            throw new Error('Manager has already been disposed!')
        }
        this.currGlob = glob
        this.disposeDisposables()

        const watcher = vscode.workspace.createFileSystemWatcher(this.currGlob)
        this.setWatcher(watcher)

        await this.rebuildRegistry()
    }

    /**
     * Disposes CloudFormationTemplateRegistryManager and marks as disposed.
     */
    public dispose(): void {
        if (!this._isDisposed) {
            this.disposeDisposables()
            this._isDisposed = true
        }
    }

    /**
     * Clears and rebuilds registry using existing glob
     * All functionality is currently internal to class, but can be made public if we want a manual "refresh" button
     */
    private async rebuildRegistry(): Promise<void> {
        this.registry.reset()
        const templateUris = await vscode.workspace.findFiles(this.currGlob)
        await this.registry.addTemplatesToRegistry(templateUris)
    }

    /**
     * Disposes disposables without marking class as disposed. Also empties this.disposables.
     */
    private disposeDisposables(): void {
        while (this.disposables.length > 0) {
            const disposable = this.disposables.pop()
            if (disposable) {
                disposable.dispose()
            }
        }
    }

    /**
     * Sets watcher functionality and adds to this.disposables
     * @param watcher vscode.FileSystemWatcher
     */
    private setWatcher(watcher: vscode.FileSystemWatcher): void {
        this.disposables.push(watcher)
        this.disposables.push(watcher.onDidChange(async uri => this.registry.addTemplateToRegistry(uri)))
        this.disposables.push(watcher.onDidCreate(async uri => this.registry.addTemplateToRegistry(uri)))
        this.disposables.push(watcher.onDidDelete(async uri => this.registry.removeTemplateFromRegistry(uri)))
    }
}
