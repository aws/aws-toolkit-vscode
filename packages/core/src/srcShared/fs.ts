/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { promises as nodefs, constants as nodeConstants } from 'fs'
import { isCloud9 } from '../shared/extensionUtilities'
import _path from 'path'
import { PermissionsError, PermissionsTriplet, isFileNotFoundError, isPermissionsError } from '../shared/errors'
import { isWeb } from '../shared/extensionGlobals'
import { getUserInfo, isWin } from '../shared/vscode/env'

const vfs = vscode.workspace.fs
type Uri = vscode.Uri

export function createPermissionsErrorHandler(
    uri: vscode.Uri,
    perms: PermissionsTriplet
): (err: unknown, depth?: number) => Promise<never> {
    return async function (err: unknown, depth = 0) {
        if (uri.scheme !== 'file' || isWin()) {
            throw err
        }
        if (!isPermissionsError(err) && !(isFileNotFoundError(err) && depth > 0)) {
            throw err
        }

        const userInfo = getUserInfo()

        if (isWeb()) {
            const stats = await fsCommon.stat(uri)
            throw new PermissionsError(uri, stats, userInfo, perms, err)
        }

        const stats = await nodefs.stat(uri.fsPath).catch(async err2 => {
            if (!isPermissionsError(err2) && !(isFileNotFoundError(err2) && perms[1] === 'w')) {
                throw err
            }

            throw await createPermissionsErrorHandler(vscode.Uri.joinPath(uri, '..'), '*wx')(err2, depth + 1)
        })

        throw new PermissionsError(uri, stats, userInfo, perms, err)
    }
}

/**
 * @warning Do not import this class directly, instead import the {@link fsCommon} instance.
 *
 * Filesystem functions compatible with both browser and desktop (node.js).
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
            await nodefs.mkdir(uriPath.fsPath, { recursive: true })
            return
        }

        return vfs.createDirectory(uriPath)
    }

    async readFile(path: Uri | string): Promise<Uint8Array> {
        path = FileSystemCommon.getUri(path)
        return vfs.readFile(path)
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

        if (isCloud9()) {
            // vscode.workspace.fs.stat() is SLOW. Avoid it on Cloud9.
            try {
                const stat = await nodefs.stat(path.fsPath)
                // Note: comparison is bitwise (&) because `FileType` enum is bitwise.
                // See vscode.FileType docstring.
                if (fileType === undefined || fileType & vscode.FileType.Unknown) {
                    return true
                } else if (fileType & vscode.FileType.Directory) {
                    return stat.isDirectory()
                } else if (fileType & vscode.FileType.File) {
                    return stat.isFile()
                }
            } catch {
                return false
            }
        }

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
            await nodefs.writeFile(path.fsPath, FileSystemCommon.asArray(data))
            return
        }
        return vfs.writeFile(path, FileSystemCommon.asArray(data))
    }

    /**
     * The stat of the file,  throws if the file does not exist or on any other error.
     */
    async stat(uri: vscode.Uri | string): Promise<vscode.FileStat> {
        const path = FileSystemCommon.getUri(uri)
        return await vfs.stat(path)
    }

    /**
     * Deletes a file or directory. It is not an error if the file/directory does not exist, unless
     * its parent directory is not listable (executable).
     *
     * @param fileOrDir Path to file or directory
     * @param opt Options.
     * - `recursive`: forcefully delete a directory. Use `recursive:false` (the default) to prevent
     *   accidentally deleting a directory when a file is expected.
     * - `force`: ignore "not found" errors. Defaults to true if `recursive:true`, else defaults to
     *   false.
     */
    async delete(fileOrDir: string | vscode.Uri, opt_?: { recursive?: boolean; force?: boolean }): Promise<void> {
        const opt = { ...opt_, recursive: !!opt_?.recursive }
        opt.force = opt.force === false ? opt.force : !!(opt.force || opt.recursive)
        const uri = FileSystemCommon.getUri(fileOrDir)
        const parent = vscode.Uri.joinPath(uri, '..')
        const errorHandler = createPermissionsErrorHandler(parent, '*wx')

        if (isCloud9()) {
            // Cloud9 does not support vscode.workspace.fs.delete.
            opt.force = !!opt.recursive
            return nodefs.rm(uri.fsPath, opt).catch(errorHandler)
        }

        if (opt.recursive) {
            // Error messages may be misleading if using the `recursive` option.
            // Need to implement our own recursive delete if we want detailed info.
            return vfs.delete(uri, opt).then(undefined, err => {
                if (!opt.force || !isFileNotFoundError(err)) {
                    throw err
                }
                // Else: ignore "not found" error.
            })
        }

        return vfs.delete(uri, opt).then(undefined, async err => {
            const notFound = isFileNotFoundError(err)

            if (notFound && opt.force) {
                return // Ignore "not found" error.
            } else if (isWeb() || isPermissionsError(err)) {
                throw await errorHandler(err)
            } else if (uri.scheme !== 'file' || (!isWin() && !notFound)) {
                throw err
            } else {
                // Try to build a more detailed "not found" error.

                // if (isMinVscode('1.80.0') && notFound) {
                //     return // Old Nodejs does not have constants.S_IXUSR.
                // }

                // Attempting to delete a file in a non-executable directory results in ENOENT.
                // But this might not be true. The file could exist, we just don't know about it.
                // Note: Windows has no "x" (executable) flag.
                const parentStat = await nodefs.stat(parent.fsPath).catch(() => {
                    throw err
                })
                const isParentExecutable = isWin() || !!(parentStat.mode & nodeConstants.S_IXUSR)
                if (!isParentExecutable) {
                    const userInfo = getUserInfo()
                    throw new PermissionsError(parent, parentStat, userInfo, '*wx', err)
                } else if (notFound) {
                    return
                }
            }

            throw err
        })
    }

    async readdir(uri: vscode.Uri | string): Promise<[string, vscode.FileType][]> {
        const path = FileSystemCommon.getUri(uri)

        // readdir is not a supported vscode API in Cloud9
        if (isCloud9()) {
            return (await nodefs.readdir(path.fsPath, { withFileTypes: true })).map(e => [
                e.name,
                e.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File,
            ])
        }

        return await vfs.readDirectory(path)
    }

    async copy(source: vscode.Uri | string, target: vscode.Uri | string): Promise<void> {
        const sourcePath = FileSystemCommon.getUri(source)
        const targetPath = FileSystemCommon.getUri(target)
        return await vfs.copy(sourcePath, targetPath, { overwrite: true })
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
const fs = fsCommon
export default fs
