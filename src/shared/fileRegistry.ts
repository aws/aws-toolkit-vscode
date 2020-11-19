/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from './logger/logger'
import * as pathutils from './utilities/pathUtils'
import * as path from 'path'

export interface WorkspaceItem<T> {
    path: string
    item: T
}

/**
 * WorkspaceFileRegistry lets us index files in the current registry. It is used
 * for CFN templates among other things
 */
export abstract class WorkspaceFileRegistry<T> implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = []
    private _isDisposed: boolean = false
    private readonly globs: vscode.GlobPattern[] = []
    private readonly excludedFilePatterns: RegExp[] = []
    private readonly registryData: Map<string, T> = new Map<string, T>()

    /**
     * Load in filesystem items, doing any parsing/validaton as required. If it fails, throws
     * @param path A string with the absolute path to the detected file
     */
    protected abstract load(path: string): Promise<T>
    /**
     * Registry name for logs
     */
    protected abstract registryName: string

    public constructor() {
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(async () => {
                await this.rebuildRegistry()
            })
        )
    }

    /**
     * Adds a glob pattern to use for lookups and resets the registry to use it.
     * Throws an error if this manager has already been disposed.
     * @param glob vscode.GlobPattern to be used for lookups
     */
    public async addWatchPattern(glob: vscode.GlobPattern): Promise<void> {
        if (this._isDisposed) {
            throw new Error(`${this.registryName}: manager has already been disposed!`)
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
            throw new Error(`${this.registryName}: manager has already been disposed!`)
        }
        this.excludedFilePatterns.push(pattern)

        await this.rebuildRegistry()
    }

    /**
     * Adds an item to registry. Wipes any existing item in its place with new copy of the data
     * @param uri vscode.Uri containing the item to load in
     */
    public async addItemToRegistry(uri: vscode.Uri, quiet?: boolean): Promise<void> {
        const excluded = this.excludedFilePatterns.find(pattern => uri.fsPath.match(pattern))
        if (excluded) {
            getLogger().verbose(
                `${this.registryName}: manager did not add item ${uri.fsPath} matching excluded pattern ${excluded}`
            )
            return
        }
        const pathAsString = pathutils.normalize(uri.fsPath)
        this.assertAbsolute(pathAsString)
        try {
            const template = await this.load(pathAsString)
            this.registryData.set(pathAsString, template)
        } catch (e) {
            if (!quiet) {
                throw e
            }
            getLogger().verbose(`${this.registryName}: item ${uri} is malformed: ${e}`)
        }
    }

    /**
     * Get a specific item's data
     * @param path Absolute path to template of interest
     */
    public getRegisteredItem(path: string): WorkspaceItem<T> | undefined {
        const normalizedPath = pathutils.normalize(path)
        this.assertAbsolute(normalizedPath)
        const item = this.registryData.get(normalizedPath)
        if (!item) {
            return undefined
        }
        return {
            path: normalizedPath,
            item: item,
        }
    }

    /**
     * Returns the registry's data as an array of paths to type T objects
     */
    public get registeredItems(): WorkspaceItem<T>[] {
        const arr: WorkspaceItem<T>[] = []

        for (const templatePath of this.registryData.keys()) {
            const template = this.getRegisteredItem(templatePath)
            if (template) {
                arr.push(template)
            }
        }

        return arr
    }

    /**
     * Removes an item from the registry.
     * @param templateUri vscode.Uri containing the uri of the item to remove
     */
    public removeItemFromRegistry(templateUri: vscode.Uri): void {
        const pathAsString = pathutils.normalize(templateUri.fsPath)
        this.assertAbsolute(pathAsString)
        this.registryData.delete(pathAsString)
    }

    /**
     * Disposes FileRegistry and marks as disposed.
     */
    public dispose(): void {
        if (!this._isDisposed) {
            while (this.disposables.length > 0) {
                const disposable = this.disposables.pop()
                if (disposable) {
                    disposable.dispose()
                }
            }
            this._isDisposed = true
        }
    }

    /**
     * Rebuilds registry using current glob and exclusion patterns.
     * All functionality is currently internal to class, but can be made public if we want a manual "refresh" button
     */
    private async rebuildRegistry(): Promise<void> {
        this.reset()
        for (const glob of this.globs) {
            const templateUris = await vscode.workspace.findFiles(glob)
            for (const template of templateUris) {
                await this.addItemToRegistry(template, true)
            }
        }
    }

    /**
     * Removes all items from the registry.
     */
    public reset() {
        this.registryData.clear()
    }

    /**
     * Sets watcher functionality and adds to this.disposables
     * @param watcher vscode.FileSystemWatcher
     */
    private addWatcher(watcher: vscode.FileSystemWatcher): void {
        this.disposables.push(
            watcher,
            watcher.onDidChange(async uri => {
                getLogger().verbose(`${this.registryName}: manager detected a change to tracked file: ${uri.fsPath}`)
                await this.addItemToRegistry(uri)
            }),
            watcher.onDidCreate(async uri => {
                getLogger().verbose(`${this.registryName}: manager detected a new file: ${uri.fsPath}`)
                await this.addItemToRegistry(uri)
            }),
            watcher.onDidDelete(async uri => {
                getLogger().verbose(`${this.registryName}: ,anager detected a deleted file: ${uri.fsPath}`)
                this.removeItemFromRegistry(uri)
            })
        )
    }

    private assertAbsolute(p: string) {
        if (!path.isAbsolute(p)) {
            throw Error(`FileRegistry: path is relative when it should be absolute: ${p}`)
        }
    }
}
