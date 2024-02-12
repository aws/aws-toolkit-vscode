/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { promises as fsPromises } from 'fs'
import { isCloud9 } from '../shared/extensionUtilities'
import _path from 'path'

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

    /** Creates the directory as well as missing parent directories. */
    async mkdir(path: Uri | string): Promise<void> {
        const uriPath = FileSystemCommon.getUri(path)

        // Certain URIs are not supported with vscode.workspace.fs in C9
        // so revert to using `fs` which works.
        if (isCloud9()) {
            await fsPromises.mkdir(uriPath.fsPath, { recursive: true })
            return
        }

        return fs.createDirectory(uriPath)
    }

    async readFile(path: Uri | string): Promise<Uint8Array> {
        path = FileSystemCommon.getUri(path)
        return fs.readFile(path)
    }

    async readFileAsString(path: Uri | string): Promise<string> {
        path = FileSystemCommon.getUri(path)
        return FileSystemCommon.arrayToString(await this.readFile(path))
    }

    /**
     * The {@link vscode.workspace.fs} implementation does not explicitly provide an append method
     * so we must do it ourselves (this implementation is inefficient).
     */
    async appendFile(path: Uri | string, content: Uint8Array | string): Promise<void> {
        path = FileSystemCommon.getUri(path)

        const currentContent: Uint8Array = (await this.existsFile(path)) ? await this.readFile(path) : new Uint8Array(0)
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
        try {
            const stat = await this.stat(path)
            // check filetype if it was given
            return fileType === undefined ? true : stat.type === fileType
        } catch (e) {
            return false
        }
    }

    async existsFile(path: Uri | string): Promise<boolean> {
        return this.exists(path, vscode.FileType.File)
    }

    async existsDir(path: Uri | string): Promise<boolean> {
        return this.exists(path, vscode.FileType.Directory)
    }

    /**
     * - Writes a file with `utf-8` encoding and `644` (rw-r--r--) permissions.
     * - Creates missing directories in the given path.
     */
    async writeFile(path: Uri | string, data: string | Uint8Array): Promise<void> {
        path = FileSystemCommon.getUri(path)

        // vscode.workspace.writeFile is stubbed in C9 has limited functionality,
        // e.g. cannot write outside of open workspace
        if (isCloud9()) {
            await fsPromises.writeFile(path.fsPath, FileSystemCommon.asArray(data))
            return
        }
        return fs.writeFile(path, FileSystemCommon.asArray(data))
    }

    /**
     * The stat of the file, undefined if the file does not exist, otherwise an error is thrown.
     */
    async stat(uri: vscode.Uri | string): Promise<vscode.FileStat> {
        const path = FileSystemCommon.getUri(uri)
        return await fs.stat(path)
    }

    async delete(uri: vscode.Uri | string): Promise<void> {
        const path = FileSystemCommon.getUri(uri)

        // vscode.workspace.fs.delete is not supported in C9
        if (isCloud9()) {
            await fsPromises.rm(path.fsPath, { recursive: true })
            return
        }

        return fs.delete(path, { recursive: true })
    }

    async readdir(uri: vscode.Uri | string): Promise<[string, vscode.FileType][]> {
        const path = FileSystemCommon.getUri(uri)

        // readdir is not a supported vscode API in Cloud9
        if (isCloud9()) {
            return (await fsPromises.readdir(path.fsPath, { withFileTypes: true })).map(e => [
                e.name,
                e.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File,
            ])
        }

        return await fs.readDirectory(path)
    }

    async copy(source: vscode.Uri | string, target: vscode.Uri | string): Promise<void> {
        const sourcePath = FileSystemCommon.getUri(source)
        const targetPath = FileSystemCommon.getUri(target)
        return await fs.copy(sourcePath, targetPath)
    }

    async unlink(uri: vscode.Uri | string): Promise<void> {
        const path = FileSystemCommon.getUri(uri)
        return await fsPromises.unlink(path.fsPath)
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

export const fsCommon = FileSystemCommon.instance
