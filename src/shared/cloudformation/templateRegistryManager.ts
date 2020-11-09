/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../logger/logger'
import { CloudFormationTemplateRegistry } from './templateRegistry'

export class CloudFormationTemplateRegistryManager implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = []
    private _isDisposed: boolean = false
    private readonly globs: vscode.GlobPattern[] = []
    private readonly excludedFilePatterns: RegExp[] = []

    public constructor(private readonly registry: CloudFormationTemplateRegistry) {
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(async () => {
                await this.rebuildRegistry()
            })
        )
    }

    /**
     * Adds a glob pattern to use for lookups and resets the registry to use it.
     * Added templates cannot be removed without restarting the extension.
     * Throws an error if this manager has already been disposed.
     * @param glob vscode.GlobPattern to be used for lookups
     */
    public async addTemplateGlob(glob: vscode.GlobPattern): Promise<void> {
        if (this._isDisposed) {
            throw new Error('Manager has already been disposed!')
        }
        this.globs.push(glob)

        const watcher = vscode.workspace.createFileSystemWatcher(glob)
        this.addWatcher(watcher)

        await this.rebuildRegistry()
    }

    /**
     * Adds a regex pattern to ignore paths containing the pattern
     */
    public async addExcludedPattern(pattern: RegExp): Promise<void> {
        if (this._isDisposed) {
            throw new Error('Manager has already been disposed!')
        }
        this.excludedFilePatterns.push(pattern)

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

    private async addTemplateToRegistry(templateUri: vscode.Uri, quiet?: boolean): Promise<void> {
        const excluded = this.excludedFilePatterns.find(pattern => templateUri.fsPath.match(pattern))
        if (excluded) {
            getLogger().verbose(`Manager did not add template ${templateUri.fsPath} matching excluded pattern ${excluded}`)
            return
        }
        await this.registry.addTemplateToRegistry(templateUri, quiet)
    }

    /**
     * Rebuilds registry using current glob and exclusion patterns.
     * All functionality is currently internal to class, but can be made public if we want a manual "refresh" button
     */
    private async rebuildRegistry(): Promise<void> {
        this.registry.reset()
        for (const glob of this.globs) {
            const templateUris = await vscode.workspace.findFiles(glob)
            for (const template of templateUris) {
                await this.addTemplateToRegistry(template, true)
            }
        }
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
    private addWatcher(watcher: vscode.FileSystemWatcher): void {
        this.disposables.push(
            watcher,
            watcher.onDidChange(async uri => {
                getLogger().verbose(`Manager detected a change to template file: ${uri.fsPath}`)
                await this.addTemplateToRegistry(uri)
            }),
            watcher.onDidCreate(async uri => {
                getLogger().verbose(`Manager detected a new template file: ${uri.fsPath}`)
                await this.addTemplateToRegistry(uri)
            }),
            watcher.onDidDelete(async uri => {
                getLogger().verbose(`Manager detected a deleted template file: ${uri.fsPath}`)
                this.registry.removeTemplateFromRegistry(uri)
            })
        )
    }
}
