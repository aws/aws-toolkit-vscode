/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { basename } from 'path'

type StatNoType = Omit<vscode.FileStat, 'type'>

interface File {
    content: Uint8Array
    stat: StatNoType & { type: vscode.FileType.File }
}

interface Directory {
    children: Record<string, File | Directory>
    stat: StatNoType & { type: vscode.FileType.Directory }
}

interface FileProvider {
    read(): Promise<Uint8Array> | Uint8Array
    stat(): Promise<StatNoType> | StatNoType
    write(content: Uint8Array): Promise<void> | void
    onDidChange: vscode.Event<void>
}

/**
 * Bare-bones file system to support in-memory operations on documents
 */
export class MemoryFileSystem implements vscode.FileSystemProvider {
    private readonly _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>()
    public readonly onDidChangeFile = this._onDidChangeFile.event
    private readonly files: Record<string, File | Directory | undefined> = {}
    private readonly fileProviders: Record<string, FileProvider | undefined> = {}

    public watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
        return { dispose: () => {} }
    }

    public async registerProvider(uri: vscode.Uri, provider: FileProvider): Promise<vscode.Disposable> {
        const key = uri.toString()
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

    private getFromMemory(uri: vscode.Uri): File | Directory {
        const key = uri.toString()
        const object = this.files[key]
        if (!object) {
            throw vscode.FileSystemError.FileNotFound()
        }
        return object
    }

    private getDirectory(uri: vscode.Uri): Directory {
        const directory = this.getFromMemory(uri)
        if (directory.stat.type === vscode.FileType.File) {
            throw vscode.FileSystemError.FileNotADirectory()
        }
        return directory as Directory
    }

    private getFile(uri: vscode.Uri): File {
        const file = this.getFromMemory(uri)
        if (file.stat.type !== vscode.FileType.File) {
            throw vscode.FileSystemError.FileIsADirectory()
        }
        return file as File
    }

    public stat(uri: vscode.Uri): vscode.FileStat {
        return this.getFromMemory(uri).stat
    }

    public readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
        const directory = this.getDirectory(uri)
        return Object.entries(directory.children).map(([k, v]) => [basename(k), v.stat.type])
    }

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

    public delete(uri: vscode.Uri, options: { recursive: boolean }): void | Thenable<void> {
        throw vscode.FileSystemError.NoPermissions()
    }

    public rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void | Thenable<void> {
        throw vscode.FileSystemError.NoPermissions()
    }
}
