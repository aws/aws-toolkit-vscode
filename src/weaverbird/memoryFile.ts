/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'

// The Scheme name of the Memory Files.
const _SCHEME = 'inmemoryfile'

export function registerMemoryFileProvider({ subscriptions }: vscode.ExtensionContext) {
    const myProvider = new (class implements vscode.TextDocumentContentProvider {
        provideTextDocumentContent(uri: vscode.Uri): string {
            const memDoc = MemoryFile.getDocument(uri)
            if (memDoc == undefined) {
                return ''
            }
            return memDoc.read()
        }
    })()
    // Register the provider using the Scheme name defined above
    subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(_SCHEME, myProvider))
}

class MemoryFileManagement {
    private static _documents: { [key: string]: MemoryFile } = {}

    public static getDocument(uri: vscode.Uri): MemoryFile | null {
        return MemoryFileManagement._documents[uri.path]
    }

    public static createDocument(filePath: string) {
        const self = new MemoryFile(filePath)

        MemoryFileManagement._documents[filePath] = self

        return self
    }
}

export class MemoryFile {
    public static getDocument(uri: vscode.Uri): MemoryFile | null {
        return MemoryFileManagement.getDocument(uri)
    }

    public static createDocument(filePath: string) {
        return MemoryFileManagement.createDocument(filePath)
    }

    public content: string = ''
    public uri: vscode.Uri

    // Read files using the memoryfileProvider
    constructor(path: string) {
        this.uri = vscode.Uri.from({ scheme: _SCHEME, path: path })
    }

    public write(strContent: string) {
        this.content += strContent
    }

    public read(): string {
        return this.content
    }

    public getUri(): vscode.Uri {
        return this.uri
    }
}
