/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import vscode from 'vscode'
import os from 'os'
import { promises as nodefs, constants as nodeConstants, WriteFileOptions } from 'fs' // eslint-disable-line no-restricted-imports
import { chmod } from 'fs/promises'
import { isCloud9 } from '../extensionUtilities'
import _path from 'path'
import {
    PermissionsError,
    PermissionsTriplet,
    ToolkitError,
    getTelemetryReasonDesc,
    isFileNotFoundError,
    isPermissionsError,
    scrubNames,
} from '../errors'
import globals from '../extensionGlobals'
import { isWin } from '../vscode/env'
import { resolvePath } from '../utilities/pathUtils'
import crypto from 'crypto'
import { waitUntil } from '../utilities/timeoutUtils'
import { telemetry } from '../telemetry/telemetry'
import { getLogger } from '../logger/logger'
import { toUri } from '../utilities/uriUtils'

const vfs = vscode.workspace.fs
type Uri = vscode.Uri

function createPermissionsErrorHandler(
    isWeb: boolean,
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

        const userInfo = fs.getUserInfo()

        if (isWeb) {
            const stats = await fs.stat(uri)
            throw new PermissionsError(uri, stats, userInfo, perms, err)
        }

        const stats = await nodefs.stat(uri.fsPath).catch(async (err2) => {
            if (!isPermissionsError(err2) && !(isFileNotFoundError(err2) && perms[1] === 'w')) {
                throw err
            }

            throw await createPermissionsErrorHandler(isWeb, vscode.Uri.joinPath(uri, '..'), '*wx')(err2, depth + 1)
        })

        throw new PermissionsError(uri, stats, userInfo, perms, err)
    }
}

/**
 * @warning Do not import this class directly, instead import the {@link fs} instance.
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
export class FileSystem {
    #homeDir: string | undefined
    #username: string | undefined
    #osUserInfo = os.userInfo

    private constructor() {}
    static #instance: FileSystem
    static get instance(): FileSystem {
        return (this.#instance ??= new FileSystem())
    }

    /** Creates the directory as well as missing parent directories. */
    async mkdir(path: Uri | string): Promise<void> {
        const uri = toUri(path)
        const errHandler = createPermissionsErrorHandler(this.isWeb, vscode.Uri.joinPath(uri, '..'), '*wx')

        // Certain URIs are not supported with vscode.workspace.fs in Cloud9
        // so revert to using `fs` which works.
        if (isCloud9()) {
            return nodefs
                .mkdir(uri.fsPath, { recursive: true })
                .then(() => {})
                .catch(errHandler)
        }

        return vfs.createDirectory(uri).then(undefined, errHandler)
    }

    /**
     * Read file into byte array.
     * @param path uri or path to file.
     * @returns byte content of file.
     */
    async readFileBytes(path: Uri | string): Promise<Uint8Array> {
        const uri = toUri(path)
        const errHandler = createPermissionsErrorHandler(this.isWeb, uri, 'r**')

        if (isCloud9()) {
            return await nodefs.readFile(uri.fsPath).catch(errHandler)
        }

        return vfs.readFile(uri).then(undefined, errHandler)
    }
    /**
     * Read file and convert the resulting bytes to a string.
     * @param path uri or path to file.
     * @param decoder decoder to be used, defaults to UTF-8
     * @returns string of decoded text.
     */
    async readFileText(path: Uri | string, decoder: TextDecoder = FileSystem.#decoder): Promise<string> {
        const uri = toUri(path)
        const bytes = await this.readFileBytes(uri)
        return decoder.decode(bytes)
    }

    /**
     * The {@link vscode.workspace.fs} implementation does not explicitly provide an append method
     * so we must do it ourselves (this implementation is inefficient).
     */
    async appendFile(path: Uri | string, content: Uint8Array | string): Promise<void> {
        path = toUri(path)

        const currentContent: Uint8Array = (await this.existsFile(path))
            ? await this.readFileBytes(path)
            : new Uint8Array(0)
        const currentLength = currentContent.length

        const newContent = this.#toBytes(content)
        const newLength = newContent.length

        const finalContent = new Uint8Array(currentLength + newLength)
        finalContent.set(currentContent)
        finalContent.set(newContent, currentLength)

        return this.writeFile(path, finalContent)
    }
    /**
     * Checks if file or folder exists.
     * @param path path to check.
     * @param fileType optional assert that path contains certain filetype.
     * @returns if path exists and matches filetype.
     */
    async exists(path: Uri | string, fileType?: vscode.FileType): Promise<boolean> {
        if (path === undefined || path === '') {
            return false
        }
        const uri = toUri(path)
        if (uri.fsPath === undefined || uri.fsPath === '') {
            return false
        }
        // Note: comparison is bitwise (&) because `FileType` enum is bitwise.
        const anyKind = fileType === undefined || fileType & vscode.FileType.Unknown

        if (isCloud9()) {
            // vscode.workspace.fs.stat() is SLOW. Avoid it on Cloud9.
            try {
                const stat = await nodefs.stat(uri.fsPath)
                if (anyKind) {
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

        const r = await this.stat(uri).then(
            (r) => r,
            (err) => !isFileNotFoundError(err)
        )
        if (typeof r === 'boolean') {
            return r
        }
        return anyKind ? true : !!(r.type & fileType)
    }

    async existsFile(path: Uri | string): Promise<boolean> {
        return this.exists(path, vscode.FileType.File)
    }

    async existsDir(path: Uri | string): Promise<boolean> {
        return this.exists(path, vscode.FileType.Directory)
    }

    /**
     * Writes `data` to file `path` (creating missing intermediate directories if needed). If `opt`
     * is not given (or in web-mode), defaults with `utf-8` encoding and `644` (rw-r--r--)
     * permissions.
     *
     * @param path File location
     * @param data File content
     * @param opts File permissions/flags. Only works in a non-web (nodejs) context. If provided,
     * nodejs filesystem interface is used instead of routing through vscode VFS.
     * @param opts.atomic If true, ensures content is not corrupted from a concurrent write.
     *                    This is not truly atomic as an async write can override the final result,
     *                    but if the content is structured like JSON it will still be parseable.
     *
     *                    Eg: we were seeing a JSON file with an unexpected extra '}' and when parsing it
     *                    failed. We suspected a race condition from separate write, and all we wanted was
     *                    a parseable JSON.
     *
     *                    This optional has an uncalcuated performance impact as there is an additional
     *                    rename() operation.
     */
    async writeFile(
        path: Uri | string,
        data: string | Uint8Array,
        opts?: WriteFileOptions & { atomic?: boolean }
    ): Promise<void> {
        const uri = toUri(path)
        const errHandler = createPermissionsErrorHandler(this.isWeb, uri, '*w*')
        const content = this.#toBytes(data)

        if (this.isWeb) {
            return vfs.writeFile(uri, content).then(undefined, errHandler)
        }

        // Node writeFile is the only way to set `writeOpts`, such as the `mode`, on a file .
        // When not in web we will use Node's writeFile() for all other scenarios.
        // It also has better error messages than VS Code's writeFile().
        let write = (u: Uri) => nodefs.writeFile(u.fsPath, content, opts).then(undefined, errHandler)

        if (isCloud9()) {
            // In Cloud9 vscode.workspace.writeFile has limited functionality, e.g. cannot write outside
            // of open workspace.
            //
            // This is future proofing in the scenario we switch the initial implementation of `write()`
            // to something else, C9 will still use node fs.
            write = (u: Uri) => nodefs.writeFile(u.fsPath, content, opts).then(undefined, errHandler)
        }

        // Node writeFile does NOT create parent folders by default, unlike VS Code FS writeFile()
        await fs.mkdir(_path.dirname(uri.fsPath))

        if (opts?.atomic) {
            // Background: As part of an "atomic write" we write to a temp file, then rename
            // to the target file. The problem was that each `rename()` implementation doesn't always
            // work. The solution is to try each implementation and then fallback to a regular write if none of them work.
            // 1. Atomic write with VSC rename(), but may throw `FileNotFound` errors
            //    - Looks to be this error from what we see in telemetry: https://github.com/microsoft/vscode/blob/09d5f4efc5089ce2fc5c8f6aeb51d728d7f4e758/src/vs/platform/files/common/fileService.ts#L1029-L1030
            // 2. Atomic write with Node rename(), but may throw `EPERM` errors on Windows
            //    - This is explained in https://github.com/aws/aws-toolkit-vscode/pull/5335
            //    - Step 1 is supposed to address the EPERM issue
            // 3. Finally, do a regular file write, but may result in invalid file content
            //
            // For telemetry, we will only report failures as to not overload with succeed events.
            const tempFile = toUri(`${uri.fsPath}.${crypto.randomBytes(8).toString('hex')}.tmp`)
            try {
                await write(tempFile)
                await fs.rename(tempFile, uri)
                return
            } catch (e) {
                telemetry.ide_fileSystem.emit({
                    action: 'writeFile',
                    result: 'Failed',
                    reason: 'writeFileAtomicVscRename',
                    reasonDesc: getTelemetryReasonDesc(e),
                })
                getLogger().warn(`writeFile atomic VSC failed for, ${uri.fsPath}, with %O`, e)
                // Atomic write with VSC rename() failed, so try with Node rename()
                try {
                    await write(tempFile)
                    await nodefs.rename(tempFile.fsPath, uri.fsPath)
                    return
                } catch (e) {
                    telemetry.ide_fileSystem.emit({
                        action: 'writeFile',
                        result: 'Failed',
                        reason: 'writeFileAtomicNodeRename',
                        reasonDesc: getTelemetryReasonDesc(e),
                    })
                    getLogger().warn(`writeFile atomic Node failed for, ${uri.fsPath}, with %O`, e)
                    // The atomic rename techniques were not successful, so we will
                    // just resort to regular a non-atomic write
                }
            } finally {
                // clean up temp file since it possibly remains
                if (await fs.exists(tempFile)) {
                    await fs.delete(tempFile)
                }
            }
        }

        await write(uri)
    }

    /**
     * Rename (move) a file or folder.
     * @param oldPath
     * @param newPath
     * @returns
     */
    async rename(oldPath: vscode.Uri | string, newPath: vscode.Uri | string) {
        const oldUri = toUri(oldPath)
        const newUri = toUri(newPath)
        const errHandler = createPermissionsErrorHandler(this.isWeb, oldUri, 'rw*')

        if (isCloud9()) {
            return nodefs.rename(oldUri.fsPath, newUri.fsPath).catch(errHandler)
        }

        /**
         * We were seeing 'FileNotFound' errors during renames, even though we did a `writeFile()` right before the rename.
         * The error looks to be from here: https://github.com/microsoft/vscode/blob/09d5f4efc5089ce2fc5c8f6aeb51d728d7f4e758/src/vs/platform/files/node/diskFileSystemProvider.ts#L747
         * So a guess is that the exists()(stat() under the hood) call needs to be retried since there may be a race condition.
         */
        let attempts = 0
        const isExists = await waitUntil(async () => {
            const result = await fs.exists(oldUri)
            attempts += 1
            return result
        }, FileSystem.renameTimeoutOpts)
        // TODO: Move the `ide_fileSystem` or some variation of this metric in to common telemetry
        // TODO: Deduplicate the `ide_fileSystem` call. Maybe have a method that all operations pass through which wraps the call in telemetry.
        //       Then look to report telemetry failure events.
        const scrubbedPath = scrubNames(oldUri.fsPath)
        if (!isExists) {
            // source path never existed after multiple attempts.
            // Either the file never existed, or had we waited longer it would have. We won't know.
            telemetry.ide_fileSystem.emit({
                result: 'Failed',
                action: 'rename',
                reason: 'SourceNotExists',
                reasonDesc: `After ${FileSystem.renameTimeoutOpts.timeout}ms the source path did not exist: ${scrubbedPath}`,
            })
        } else if (attempts > 1) {
            // Indicates that rename() would have failed if we had not waited for it to exist.
            telemetry.ide_fileSystem.emit({
                result: 'Succeeded',
                action: 'rename',
                reason: 'RenameRaceCondition',
                reasonDesc: `After multiple attempts the source path existed: ${scrubbedPath}`,
                attempts: attempts,
            })
        }

        return vfs.rename(oldUri, newUri, { overwrite: true }).then(undefined, errHandler)
    }

    /**
     * It looks like scenario of a failed rename is rare,
     * so we can afford to have a longer timeout and interval.
     *
     * These values are an arbitrary guess to how long it takes
     * for a newly created file to be visible on the filesystem.
     */
    static readonly renameTimeoutOpts = {
        timeout: 10_000,
        interval: 300,
    } as const

    /**
     * The stat of the file,  throws if the file does not exist or on any other error.
     */
    async stat(uri: vscode.Uri | string): Promise<vscode.FileStat> {
        const path = toUri(uri)
        return await vfs.stat(path)
    }

    /**
     * Change permissions on file. Note that this will do nothing on browser.
     * @param uri file whose permissions should be set.
     * @param mode new permissions in octal notation.
     * More info: https://nodejs.org/api/fs.html#fspromiseschmodpath-mode
     * Examples: https://www.geeksforgeeks.org/node-js-fspromises-chmod-method/
     */
    async chmod(uri: vscode.Uri | string, mode: number): Promise<void> {
        if (!this.isWeb) {
            const path = toUri(uri)
            await chmod(path.fsPath, mode)
        }
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
        const uri = toUri(fileOrDir)
        const parent = vscode.Uri.joinPath(uri, '..')
        const errHandler = createPermissionsErrorHandler(this.isWeb, parent, '*wx')

        if (isCloud9()) {
            // Cloud9 does not support vscode.workspace.fs.delete.
            opt.force = !!opt.recursive
            return nodefs.rm(uri.fsPath, opt).catch(errHandler)
        }

        if (opt.recursive) {
            // Error messages may be misleading if using the `recursive` option.
            // Need to implement our own recursive delete if we want detailed info.
            return vfs.delete(uri, opt).then(undefined, (err) => {
                if (!opt.force || !isFileNotFoundError(err)) {
                    throw err
                }
                // Else: ignore "not found" error.
            })
        }

        return vfs.delete(uri, opt).then(undefined, async (err) => {
            const notFound = isFileNotFoundError(err)

            if (notFound && opt.force) {
                return // Ignore "not found" error.
            } else if (this.isWeb || isPermissionsError(err)) {
                throw await errHandler(err)
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
                    const userInfo = this.getUserInfo()
                    throw new PermissionsError(parent, parentStat, userInfo, '*wx', err)
                } else if (notFound) {
                    return
                }
            }

            throw err
        })
    }

    async readdir(uri: vscode.Uri | string): Promise<[string, vscode.FileType][]> {
        const path = toUri(uri)

        // readdir is not a supported vscode API in Cloud9
        if (isCloud9()) {
            return (await nodefs.readdir(path.fsPath, { withFileTypes: true })).map((e) => [
                e.name,
                e.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File,
            ])
        }

        return await vfs.readDirectory(path)
    }
    /**
     * Copy target file or directory
     * @param source
     * @param target
     * @returns
     */
    async copy(source: vscode.Uri | string, target: vscode.Uri | string): Promise<void> {
        const sourcePath = toUri(source)
        const targetPath = toUri(target)
        return await vfs.copy(sourcePath, targetPath, { overwrite: true })
    }

    /**
     * Checks if the current user has _at least_ the specified permissions.
     *
     * This throws {@link PermissionsError} when permissions are insufficient.
     */
    async checkPerms(file: string | vscode.Uri, perms: PermissionsTriplet): Promise<void> {
        // TODO: implement checkExactPerms() by checking the file mode.
        // public static async checkExactPerms(file: string | vscode.Uri, perms: `${PermissionsTriplet}${PermissionsTriplet}${PermissionsTriplet}`)
        const uri = toUri(file)
        const errHandler = createPermissionsErrorHandler(this.isWeb, uri, perms)
        const flags = Array.from(perms) as (keyof typeof this.modeMap)[]
        const mode = flags.reduce((m, f) => m | this.modeMap[f], nodeConstants.F_OK)

        return nodefs.access(uri.fsPath, mode).catch(errHandler)
    }

    /**
     * Returns the file or directory location given by `envVar` if it is non-empty and the location is valid (exists) on the filesystem.
     *
     * Special case: if 'HOMEPATH' is given then $HOMEDRIVE is prepended to it.
     *
     * Throws an exception if the env var path is non-empty but invalid.
     *
     * @param envVar Environment variable name
     * @param kind Expect a valid file, directory, or either.
     */
    async tryGetFilepathEnvVar(envVar: string, kind: vscode.FileType | undefined): Promise<string | undefined> {
        let envVal = process.env[envVar]

        if (envVal) {
            // Special case: Windows $HOMEPATH depends on $HOMEDRIVE.
            if (envVar === 'HOMEPATH') {
                const homeDrive = process.env.HOMEDRIVE || 'C:'
                envVal = _path.join(homeDrive, envVal)
            }

            // Expand "~/" to home dir.
            const f = resolvePath(envVal, this.#homeDir ?? 'UNKNOWN-HOME')
            if (await fs.exists(f, kind)) {
                return f
            }

            throw new ToolkitError(`\$${envVar} filepath is invalid: "${f}"`)
        }
    }

    /**
     * Initializes the FileSystem object. Resolves the user's home directory and validates related
     * environment variables. Should be called:
     *  1. at startup after all env vars are set
     *  2. whenver env vars change
     *
     * @param onFail Invoked if a valid home directory could not be resolved
     * @returns List of error messages if any invalid env vars were found.
     */
    async init(
        extContext: vscode.ExtensionContext,
        onFail: (homeDir: string) => void,
        osUserInfo?: typeof os.userInfo
    ): Promise<string[]> {
        this.#username = undefined
        this.#osUserInfo = osUserInfo ?? os.userInfo

        if (this.isWeb) {
            // When in browser we cannot access the users desktop file system.
            // Instead, VS Code provided uris will use the browsers storage.
            // IMPORTANT: we must preserve the scheme of this URI or else VS Code
            // will incorrectly interpret the path.
            this.#homeDir = extContext.globalStorageUri.toString()
            return []
        }

        /** Logger may not be available during startup, so messages are stored here. */
        const logMsgs: string[] = []
        function logErr(e: unknown): undefined {
            logMsgs.push((e as Error).message)
            return undefined
        }
        const tryGet = (envName: string) => {
            return this.tryGetFilepathEnvVar(envName, vscode.FileType.Directory).catch(logErr)
        }
        let p: string | undefined
        if ((p = await tryGet('HOME'))) {
            this.#homeDir = p
        } else if ((p = await tryGet('USERPROFILE'))) {
            this.#homeDir = p
        } else if ((p = await tryGet('HOMEPATH'))) {
            this.#homeDir = p
        } else {
            this.#homeDir = os.homedir()
        }

        // If $HOME is bogus, os.homedir() will still return it! All we can do is show an error.
        if (!(await fs.exists(this.#homeDir, vscode.FileType.Directory))) {
            onFail(this.#homeDir)
        }

        return logMsgs
    }

    /**
     * Gets the (cached) user home directory path.
     *
     * To update the cached value (e.g. after environment variables changed), call {@link init()}.
     */
    getUserHomeDir(): string {
        if (!this.#homeDir) {
            throw new Error('call fs.init() before using fs.getHomeDirectory()')
        }
        return this.#homeDir
    }

    /**
     * Gets the (cached) username for this session, or "webuser" in web-mode, or "unknown-user" if
     * a username could not be resolved.
     *
     * If `os.userInfo` fails, tries these fallbacks:
     * - `process.env.USER`
     * - getUserHomeDir() directory name
     */
    getUsername(): string {
        if (!this.#homeDir) {
            throw new Error('call fs.init() before using fs.getUsername()')
        }

        if (this.#username !== undefined) {
            return this.#username
        }

        const userInfo = this.getUserInfo()
        this.#username = userInfo.username

        return userInfo.username
    }

    /**
     * Gets platform-dependent user info, or a dummy object on failure or for web-mode.
     *
     * See {@link getUsername} for username resolution.
     */
    getUserInfo(): os.UserInfo<string> {
        if (!this.#homeDir) {
            throw new Error('call fs.init() before using fs.getUserInfo()')
        }

        const fallback = {
            gid: 0,
            uid: 0,
            homedir: this.getUserHomeDir(),
            shell: '',
            username: 'unknown-user',
        }

        if (this.isWeb) {
            return {
                ...fallback,
                username: 'webuser',
            }
        }

        try {
            return this.#osUserInfo({ encoding: 'utf-8' })
        } catch {
            const envUser = process.env.USER ?? ''
            if (envUser.trim() !== '') {
                fallback.username = envUser
            } else if (fallback.homedir.trim() !== '') {
                fallback.username = _path.basename(fallback.homedir.replace(/[\/\\]$/g, ''))
            }
            return fallback
        }
    }
    // Defaults to UTF-8 encoding/decoding.
    static readonly #decoder = new TextDecoder()
    static readonly #encoder = new TextEncoder()

    private static stringToArray(string: string): Uint8Array {
        return FileSystem.#encoder.encode(string)
    }

    /** Encodes UTF-8 string data as bytes. */
    #toBytes(data: Uint8Array | string): Uint8Array {
        if (typeof data === 'string') {
            return FileSystem.stringToArray(data)
        }
        return data
    }

    private get modeMap() {
        return {
            '*': 0,
            r: nodeConstants.R_OK,
            w: nodeConstants.W_OK,
            x: nodeConstants.X_OK,
        } as const
    }

    private get isWeb(): boolean {
        return globals.isWeb
    }
}

export const fs = FileSystem.instance
export default fs
