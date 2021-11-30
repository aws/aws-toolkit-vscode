/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

type ReducedStat = Omit<vscode.FileStat, 'size' | 'type'>

interface File {
    content: Uint8Array
    stat: ReducedStat & { type: vscode.FileType.File }
}

/**
 * Basic 'provider' for an in-memory file
 *
 * Contents for the file are read as-needed based on the `onDidChange` event.
 * It is up to callers to dispose of the registered provider to free-up memory.
 */
export interface FileProvider {
    read(): Promise<Uint8Array> | Uint8Array
    stat(): Promise<ReducedStat> | ReducedStat
    write(content: Uint8Array): Promise<void> | void
    onDidChange: vscode.Event<void>
}

/**
 * Bare-bones file system to support in-memory operations on documents
 * Does not support directories
 */
export class MemoryFileSystem implements vscode.FileSystemProvider {
    private readonly _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>()
    public readonly onDidChangeFile = this._onDidChangeFile.event
    private readonly files: Record<string, File | undefined> = {}
    private readonly fileProviders: Record<string, FileProvider | undefined> = {}

    public watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
        // By ignoring the arguments we essentially are watching all file changes, which is ok for our use-case
        return { dispose: () => {} }
    }

    /**
     * Adds a new {@link FileProvider} for the given URI.
     *
     * Registering a new provider greedily loads the content into memory, so this function call
     * should be awaited before attempting to open a document for the given URI.
     *
     * @returns A {@link vscode.Disposable} to free-up memory
     */
    public async registerProvider(uri: vscode.Uri, provider: FileProvider): Promise<vscode.Disposable> {
        const key = this.uriToKey(uri)
        if (this.fileProviders[key] !== undefined) {
            throw new Error('Cannot re-register a provider for the same URI')
        }
        this.fileProviders[key] = provider
        const onDidChange = provider.onDidChange(async () => {
            this.files[key] = await this.getFromProvider(provider)
            this._onDidChangeFile.fire([{ uri, type: vscode.FileChangeType.Changed }])
        })

        this.files[key] = await this.getFromProvider(provider)

        return vscode.Disposable.from(onDidChange, { dispose: () => delete this.fileProviders[key] })
    }

    private async getFromProvider(provider: FileProvider): Promise<File> {
        return {
            content: await provider.read(),
            stat: { ...(await provider.stat()), type: vscode.FileType.File },
        }
    }

    private getFile(uri: vscode.Uri): File {
        const file = this.files[this.uriToKey(uri)]
        if (file?.stat.type !== vscode.FileType.File) {
            throw vscode.FileSystemError.FileIsADirectory()
        }
        return file
    }

    public stat(uri: vscode.Uri): vscode.FileStat {
        const file = this.getFile(uri)
        return { ...file.stat, size: file.content.length }
    }

    /**
     * @notimplemented
     */
    public readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
        throw vscode.FileSystemError.NoPermissions()
    }

    /**
     * @notimplemented
     */
    public createDirectory(uri: vscode.Uri): void | Thenable<void> {
        throw vscode.FileSystemError.NoPermissions()
    }

    public readFile(uri: vscode.Uri): Uint8Array {
        return this.getFile(uri).content
    }

    public async writeFile(
        uri: vscode.Uri,
        content: Uint8Array,
        options: { create: boolean; overwrite: boolean }
    ): Promise<void> {
        const provider = this.fileProviders[uri.toString()]
        if (!provider) {
            throw vscode.FileSystemError.FileNotFound()
        }
        await provider.write(content)
    }

    /**
     * @notimplemented
     */
    public delete(uri: vscode.Uri, options: { recursive: boolean }): void | Thenable<void> {
        throw vscode.FileSystemError.NoPermissions()
    }

    /**
     * @notimplemented
     */
    public rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void | Thenable<void> {
        throw vscode.FileSystemError.NoPermissions()
    }

    /**
     * Converts a URI to something usable by the file system
     */
    public uriToKey(uri: vscode.Uri): string {
        return uri.with({ query: '', fragment: '' }).toString()
    }
}
