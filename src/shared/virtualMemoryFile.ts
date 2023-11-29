/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { FileProvider } from './virtualFilesystem'

export class VirtualMemoryFile implements FileProvider {
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChange = this.onDidChangeEmitter.event
    private fileContents: Uint8Array

    public constructor(fileContents: Uint8Array) {
        this.fileContents = fileContents
    }

    public stat(): { ctime: number; mtime: number; size: number } {
        // This would need to be filled out to track conflicts
        return { ctime: 0, mtime: 0, size: 0 }
    }

    public async read(): Promise<Uint8Array> {
        return this.fileContents
    }

    public async write(content: Uint8Array): Promise<void> {
        this.fileContents = content
    }
}
