/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'

const fs = vscode.workspace.fs
type Uri = vscode.Uri

/**
 * @warning Do not import this class specifically, instead import the instance {@link fsCommon}.
 *
 * This class contains file system methods that are "common", meaning
 * it can be used in the browser or desktop.
 *
 * Technical Details:
 * TODO: Verify the point below once I get this hooked up to the browser code.
 * - vscode.workspace.fs dynamically resolves the correct file system provider
 *   to use. This means that in the browser it will attempt to use the File System
 *   Access API.
 *
 *
 * MODIFYING THIS CLASS:
 * - All methods must work for both browser and desktop
 * - Do not use 'fs' or 'fs-extra' since they are not browser compatible.
 *   If they have functionality that cannot be achieved with a
 *   browser+desktop implementation, then create it in the module {@link TODO}
 */
export class FileSystemCommon {
    private constructor() {}
    static #instance: FileSystemCommon
    static get instance(): FileSystemCommon {
        return (this.#instance ??= new FileSystemCommon())
    }

    async mkdir(path: Uri | string): Promise<void> {
        path = FileSystemCommon.getUri(path)
        return fs.createDirectory(path)
    }

    async readFile(path: Uri | string): Promise<Uint8Array> {
        path = FileSystemCommon.getUri(path)
        return fs.readFile(path)
    }

    async readFileAsString(path: Uri | string): Promise<string> {
        path = FileSystemCommon.getUri(path)
        return FileSystemCommon.arrayToString(await this.readFile(path))
    }

    async appendFile(path: Uri | string, content: Uint8Array | string): Promise<void> {
        path = FileSystemCommon.getUri(path)

        const currentContent: Uint8Array = (await this.fileExists(path)) ? await this.readFile(path) : new Uint8Array(0)
        const currentLength = currentContent.length

        const newContent = FileSystemCommon.asArray(content)
        const newLength = newContent.length

        const finalContent = new Uint8Array(currentLength + newLength)
        finalContent.set(currentContent)
        finalContent.set(newContent, currentLength)

        return this.writeFile(path, finalContent)
    }

    async exists(path: Uri | string, fileType?: vscode.FileType): Promise<boolean> {
        path = FileSystemCommon.getUri(path)
        const stat = await this.stat(path)

        // No specific filetype, so only check if anything exists
        if (fileType === undefined) {
            return stat !== undefined
        }

        // Check if file exists and is expected filetype
        return stat === undefined ? false : stat.type === fileType
    }

    async fileExists(path: Uri | string): Promise<boolean> {
        return this.exists(path, vscode.FileType.File)
    }

    async directoryExists(path: Uri | string): Promise<boolean> {
        return this.exists(path, vscode.FileType.Directory)
    }

    async writeFile(path: Uri | string, data: string | Uint8Array): Promise<void> {
        path = FileSystemCommon.getUri(path)
        return fs.writeFile(path, FileSystemCommon.asArray(data))
    }

    /**
     * The stat of the file, undefined if the file does not exist, otherwise an error is thrown.
     */
    async stat(uri: vscode.Uri | string): Promise<vscode.FileStat | undefined> {
        const path = FileSystemCommon.getUri(uri)
        try {
            return await fs.stat(path)
        } catch (err) {
            if (err instanceof vscode.FileSystemError && err.code === 'FileNotFound') {
                return undefined
            }
            throw err
        }
    }

    async delete(uri: vscode.Uri | string): Promise<void> {
        const path = FileSystemCommon.getUri(uri)
        return fs.delete(path, { recursive: true })
    }

    async readdir(uri: vscode.Uri | string): Promise<[string, vscode.FileType][]> {
        const path = FileSystemCommon.getUri(uri)
        return await fs.readDirectory(path)
    }

    // -------- private methods --------
    static readonly #decoder = new TextDecoder()
    static readonly #encoder = new TextEncoder()

    private static arrayToString(array: Uint8Array) {
        return FileSystemCommon.#decoder.decode(array)
    }

    private static stringToArray(string: string): Uint8Array {
        return FileSystemCommon.#encoder.encode(string)
    }

    private static asArray(array: Uint8Array | string): Uint8Array {
        if (typeof array === 'string') {
            return FileSystemCommon.stringToArray(array)
        }
        return array
    }

    /**
     * Retrieve the Uri of the file.
     *
     * @param path The file path for which to retrieve metadata.
     * @return The Uri about the file.
     */
    private static getUri(path: string | vscode.Uri): vscode.Uri {
        if (path instanceof vscode.Uri) {
            return path
        }
        return vscode.Uri.file(path)
    }
}
