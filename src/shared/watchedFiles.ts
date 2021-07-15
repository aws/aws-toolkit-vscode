/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from './logger/logger'
import * as pathutils from './utilities/pathUtils'
import * as path from 'path'

export interface WatchedItem<T> {
    /**
     * The absolute path to the file
     */
    path: string
    /**
     * An item based on the file and type of WatchedFiles
     */
    item: T
}

/**
 * WatchedFiles lets us index files in the current registry. It is used
 * for CFN templates among other things. WatchedFiles holds a list of pairs of
 * the absolute path to the file along with a transform of it that is useful for
 * where it is used. For example, for templates, it parses the template and stores it.
 */
export abstract class WatchedFiles<T> implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = []
    private _isDisposed: boolean = false
    private readonly globs: vscode.GlobPattern[] = []
    private readonly excludedFilePatterns: RegExp[] = []
    private readonly registryData: Map<string, T> = new Map<string, T>()

    /**
     * Load in filesystem items, doing any parsing/validaton as required. If it fails, throws
     * @param path A string with the absolute path to the detected file
     */
    protected abstract load(path: string): Promise<T | undefined>
    /**
     * Name for logs
     */
    protected abstract name: string

    public constructor() {
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(async () => {
                await this.rebuild()
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
            throw new Error(`${this.name}: manager has already been disposed!`)
        }
        this.globs.push(glob)

        const watcher = vscode.workspace.createFileSystemWatcher(glob)
        this.addWatcher(watcher)

        await this.rebuild()
    }

    /**
     * Adds a regex pattern to ignore paths containing the pattern
     */
    public async addExcludedPattern(pattern: RegExp): Promise<void> {
        if (this._isDisposed) {
            throw new Error(`${this.name}: manager has already been disposed!`)
        }
        this.excludedFilePatterns.push(pattern)

        await this.rebuild()
    }

    /**
     * Adds an item to registry. Wipes any existing item in its place with new copy of the data
     * @param uri vscode.Uri containing the item to load in
     */
    public async addItemToRegistry(uri: vscode.Uri, quiet?: boolean): Promise<void> {
        const excluded = this.excludedFilePatterns.find(pattern => uri.fsPath.match(pattern))
        if (excluded) {
            getLogger().verbose(
                `${this.name}: manager did not add item ${uri.fsPath} matching excluded pattern ${excluded}`
            )
            return
        }
        const pathAsString = pathutils.normalize(uri.fsPath)
        this.assertAbsolute(pathAsString)
        try {
            const item = await this.load(pathAsString)
            if (item) {
                this.registryData.set(pathAsString, item)
            } else {
                // if value isn't valid for type, remove from registry
                this.registryData.delete(pathAsString)
            }
        } catch (e) {
            if (!quiet) {
                throw e
            }
            getLogger().verbose(`${this.name}: item ${uri} is malformed: ${e}`)
        }
    }

    /**
     * Get a specific item's data
     * @param path Absolute path to item of interest or a vscode.Uri to the item
     */
    public getRegisteredItem(path: string | vscode.Uri): WatchedItem<T> | undefined {
        // fsPath is needed for Windows, it's equivalent to path on mac/linux
        const absolutePath = typeof path === 'string' ? path : path.fsPath
        const normalizedPath = pathutils.normalize(absolutePath)
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
    public get registeredItems(): WatchedItem<T>[] {
        const arr: WatchedItem<T>[] = []

        for (const itemPath of this.registryData.keys()) {
            const item = this.getRegisteredItem(itemPath)
            if (item) {
                arr.push(item)
            }
        }

        return arr
    }

    /**
     * Removes an item from the registry.
     * @param absolutePath The absolute path to the item or a vscode.Uri to the item
     */
    public async remove(path: string | vscode.Uri): Promise<void> {
        if (typeof path === 'string') {
            this.registryData.delete(path)
        } else {
            const pathAsString = pathutils.normalize(path.fsPath)
            this.assertAbsolute(pathAsString)
            this.registryData.delete(pathAsString)
        }
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
    private async rebuild(): Promise<void> {
        this.reset()
        for (const glob of this.globs) {
            const itemUris = await vscode.workspace.findFiles(glob)
            for (const item of itemUris) {
                await this.addItemToRegistry(item, true)
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
                getLogger().verbose(`${this.name}: manager detected a change to tracked file: ${uri.fsPath}`)
                await this.addItemToRegistry(uri)
            }),
            watcher.onDidCreate(async uri => {
                getLogger().verbose(`${this.name}: manager detected a new file: ${uri.fsPath}`)
                await this.addItemToRegistry(uri)
            }),
            watcher.onDidDelete(async uri => {
                getLogger().verbose(`${this.name}: manager detected a deleted file: ${uri.fsPath}`)
                await this.remove(uri)
            })
        )
    }

    private assertAbsolute(p: string) {
        if (!path.isAbsolute(p)) {
            throw Error(`FileRegistry: path is relative when it should be absolute: ${p}`)
        }
    }
}

export class NoopWatcher extends WatchedFiles<any> {
    protected async load(path: string): Promise<any> {
        throw new Error(`Attempted to add a file to the NoopWatcher: ${path}`)
    }
    protected name: string = 'NoOp'
}
