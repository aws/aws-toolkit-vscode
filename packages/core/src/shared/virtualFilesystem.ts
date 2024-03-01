/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

type StatNoType = Omit<vscode.FileStat, 'type'>

/**
 * Basic 'provider' for a file.
 *
 * Memory-managment is left up to the caller.
 * Contents for the file are read as-needed based on the `onDidChange` event.
 */
export interface FileProvider {
    onDidChange: vscode.Event<void>
    read(): Promise<Uint8Array> | Uint8Array
    stat(): Promise<StatNoType> | StatNoType
    write(content: Uint8Array, options: { create: boolean; overwrite: boolean }): Promise<void> | void
}

/**
 * Bare-bones file system to support in-memory operations on single documents.
 * Does not support directories.
 */
export class VirtualFileSystem implements vscode.FileSystemProvider {
    private readonly _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>()
    public readonly onDidChangeFile = this._onDidChangeFile.event
    private readonly fileProviders: Record<string, FileProvider | undefined> = {}

    public constructor(private readonly errorMessage?: string) {}

    public watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
        // By ignoring the arguments we essentially are watching all file changes, which is ok for our use-case
        return { dispose: () => {} }
    }

    /**
     * Adds a new {@link FileProvider} for the given URI.
     *
     * @returns A {@link vscode.Disposable} to remove the provider.
     */
    public registerProvider(uri: vscode.Uri, provider: FileProvider): vscode.Disposable {
        const key = this.uriToKey(uri)
        if (this.fileProviders[key] !== undefined) {
            throw new Error('Cannot re-register a provider for the same URI')
        }

        this.fileProviders[key] = provider
        const onDidChange = provider.onDidChange(() => {
            this._onDidChangeFile.fire([{ uri, type: vscode.FileChangeType.Changed }])
        })

        return vscode.Disposable.from(onDidChange, { dispose: () => delete this.fileProviders[key] })
    }

    private getProvider(uri: vscode.Uri): FileProvider {
        const provider = this.fileProviders[this.uriToKey(uri)]
        if (!provider) {
            throw new Error(this.errorMessage)
        }
        return provider
    }

    public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        const stats = await this.getProvider(uri).stat()
        return { ...stats, type: vscode.FileType.File }
    }

    /**
     * @notimplemented
     */
    public readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
        throw new Error(this.errorMessage)
    }

    /**
     * @notimplemented
     */
    public createDirectory(uri: vscode.Uri): void | Thenable<void> {
        throw new Error(this.errorMessage)
    }

    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        return this.getProvider(uri).read()
    }

    public async writeFile(
        uri: vscode.Uri,
        content: Uint8Array,
        options: { create: boolean; overwrite: boolean }
    ): Promise<void> {
        return this.getProvider(uri).write(content, options)
    }

    /**
     * @notimplemented
     */
    public delete(uri: vscode.Uri, options: { recursive: boolean }): void | Thenable<void> {
        throw new Error(this.errorMessage)
    }

    /**
     * @notimplemented
     */
    public rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void | Thenable<void> {
        throw new Error(this.errorMessage)
    }

    /**
     * Removes parts of the URI not relevant to the filesystem, then converts the URI to a string.
     */
    public uriToKey(uri: vscode.Uri): string {
        return uri.with({ query: '', fragment: '' }).toString()
    }
}
