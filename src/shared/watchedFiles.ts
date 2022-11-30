/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from './logger/logger'
import * as pathutils from './utilities/pathUtils'
import * as path from 'path'
import { isUntitledScheme, normalizeVSCodeUri } from './utilities/vsCodeUtils'

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
 * the absolute path to the file or "untitled:" URI along with a transform of it that is useful for
 * where it is used. For example, for templates, it parses the template and stores it.
 */
export abstract class WatchedFiles<T> implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = []
    private _isDisposed: boolean = false
    private readonly globs: vscode.GlobPattern[] = []
    private readonly excludedFilePatterns: RegExp[] = []
    private readonly registryData: Map<string, T> = new Map<string, T>()

    /**
     * Process any incoming URI/content, doing any parsing/validation as required.
     * If the path does not point to a file on the local file system then contents should be defined.
     * If it fails, throws
     * @param path A uri with the absolute path to the detected file
     */
    protected abstract process(path: vscode.Uri, contents?: string): Promise<T | undefined>

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
     * Creates a watcher across all opened workspace folders (or see below to
     * watch _outside_ the workspace).
     *
     * (since vscode 1.64):
     * - Watches RECURSIVELY if `pattern` is complex (e.g. contains `**` or
     *   path segments), else watches NON-RECURSIVELY (i.e. only changes at the
     *   first level will be reported).
     *   https://github.com/microsoft/vscode/blob/7da792ae7cb53ee5a22b24016bca5dee31f43d41/src/vscode-dts/vscode.d.ts#L11428
     * - `globPattern` as _string_ means "watch all opened workspace folders".
     *   It cannot be used to add more folders for watching, nor will it report
     *   events outside of workspace folders.
     * - To watch _outside_ the workspace, pass `vscode.RelativePattern(vscode.Uri(…))`:
     *   - non-recursive: `addWatchPattern(new RelativePattern(Uri.file(…), '*.js'))`
     *   - recursive: `addWatchPattern(new RelativePattern(Uri.file(…), '**x/*.js'))`
     * - **Note** recursive files may be excluded by user configuration
     *   (`files.watcherExclude`, e.g. "node_modules"). To avoid that, watch
     *   simple (non-recursive) patterns.
     *
     * https://github.com/microsoft/vscode/issues/3025#issuecomment-1007242256
     *
     * > we setup recursive watchers for all workspace folders right on startup
     * > and we don't allow extensions to add additional watchers for the
     * > workspace, because that would result in multiple watchers on the same
     * > paths competing against each other.
     *
     * @param glob Pattern to match against (across all opened workspace folders)
     */
    public async addWatchPattern(glob: vscode.GlobPattern): Promise<void> {
        if (this._isDisposed) {
            throw new Error(`${this.name}: manager has already been disposed!`)
        }
        if (typeof glob === 'string' && !vscode.workspace.workspaceFolders?.[0]) {
            getLogger().warn(`${this.name}: addWatchPattern(${glob}): no workspace`)
        }
        this.globs.push(glob)

        const watcher = vscode.workspace.createFileSystemWatcher(glob)
        this.addWatcher(watcher)

        await this.rebuild()
    }

    /**
     * Create a special watcher that operates only on untitled files.
     * To "watch" the in-memory contents of an untitled:/ file we just subscribe to `onDidChangeTextDocument`
     */
    public async watchUntitledFiles() {
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
                if (isUntitledScheme(event.document.uri)) {
                    this.addItemToRegistry(event.document.uri, true, event.document.getText())
                }
            }),
            vscode.workspace.onDidCloseTextDocument((event: vscode.TextDocument) => {
                if (isUntitledScheme(event.uri)) {
                    this.remove(event.uri)
                }
            })
        )
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
    public async addItemToRegistry(uri: vscode.Uri, quiet?: boolean, contents?: string): Promise<void> {
        const excluded = this.excludedFilePatterns.find(pattern => uri.fsPath.match(pattern))
        if (excluded) {
            getLogger().verbose(`${this.name}: excluding path (matches "${excluded}"): ${uri.fsPath}`)
            return
        }
        this.assertAbsolute(uri)
        const pathAsString = normalizeVSCodeUri(uri)
        try {
            const item = await this.process(uri, contents)
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
            getLogger().verbose(`${this.name}: failed to load(): ${uri}: ${(e as Error).message}`)
        }
    }

    /**
     * Get a specific item's data
     * Untitled files must be referred to by their URI
     * @param path Absolute path to item of interest or a vscode.Uri to the item
     */
    public getRegisteredItem(path: string | vscode.Uri): WatchedItem<T> | undefined {
        // fsPath is needed for Windows, it's equivalent to path on mac/linux
        const normalizedPath = typeof path === 'string' ? pathutils.normalize(path) : normalizeVSCodeUri(path)
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
     *
     * @param path Path to the item
     */
    public async remove(path: vscode.Uri): Promise<void> {
        const pathAsString = normalizeVSCodeUri(path)
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
    public async rebuild(): Promise<void> {
        this.reset()
        for (const glob of this.globs) {
            const itemUris = await vscode.workspace.findFiles(glob)
            console.log(`[rebuild]:\n${this.getUriStrings(itemUris).join('\n')}\n`)
            for (const item of itemUris) {
                await this.addItemToRegistry(item, true)
            }
        }
    }

    getUriStrings(uris: vscode.Uri[]): string[] {
        return uris.map(uri => uri.fsPath).sort((a, b) => (a > b ? 1 : -1))
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
                getLogger().verbose(`${this.name}: detected change: ${uri.fsPath}`)
                await this.addItemToRegistry(uri)
            }),
            watcher.onDidCreate(async uri => {
                getLogger().verbose(`${this.name}: detected new file: ${uri.fsPath}`)
                await this.addItemToRegistry(uri)
            }),
            watcher.onDidDelete(async uri => {
                getLogger().verbose(`${this.name}: detected delete: ${uri.fsPath}`)
                await this.remove(uri)
            })
        )
    }

    /**
     * Assert if the path is absolute.
     * Untitled URIs are considered absolute
     * @param p The path to verify
     */
    private assertAbsolute(p: string | vscode.Uri) {
        const pathAsString = typeof p === 'string' ? p : p.fsPath
        if (
            (typeof p === 'string' && !path.isAbsolute(pathAsString) && !pathAsString.startsWith('untitled:')) ||
            (typeof p !== 'string' && !path.isAbsolute(pathAsString) && !isUntitledScheme(p))
        ) {
            throw new Error(`FileRegistry: path is relative when it should be absolute: ${pathAsString}`)
        }
    }
}

export class NoopWatcher extends WatchedFiles<any> {
    protected async process(uri: vscode.Uri): Promise<any> {
        throw new Error(`Attempted to add a file to the NoopWatcher: ${uri.fsPath}`)
    }
    protected name: string = 'NoOp'
}
