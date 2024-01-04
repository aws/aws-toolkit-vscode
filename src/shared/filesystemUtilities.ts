/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdtemp, mkdirp, readFile, remove, existsSync } from 'fs-extra'
import * as crypto from 'crypto'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { getLogger } from './logger'
import * as pathutils from './utilities/pathUtils'
import globals from '../shared/extensionGlobals'
import { GlobalState } from './globalState'
import { fsCommon } from '../srcShared/fs'
import fs from 'fs'

const defaultEncoding: BufferEncoding = 'utf8'

export const tempDirPath = path.join(
    // https://github.com/aws/aws-toolkit-vscode/issues/240
    os.type() === 'Darwin' ? '/tmp' : os.tmpdir(),
    'aws-toolkit-vscode'
)

export async function getDirSize(
    dirPath: string,
    startTime: number,
    duration: number,
    fileExt: string
): Promise<number> {
    if (performance.now() - startTime > duration) {
        getLogger().warn('getDirSize: exceeds time limit')
        return 0
    }
    const files = await fsCommon.readdir(dirPath)
    const fileSizes = files.map(async file => {
        const [fileName, type] = file
        const filePath = path.join(dirPath, fileName)

        if (type === vscode.FileType.SymbolicLink) {
            return 0
        }
        if (type === vscode.FileType.Directory) {
            return getDirSize(filePath, startTime, duration, fileExt)
        }
        if (type === vscode.FileType.File && fileName.endsWith(fileExt)) {
            const stat = (await fsCommon.stat(filePath))!
            return stat.size
        }

        return 0
    })
    return (await Promise.all(fileSizes)).reduce((accumulator, size) => accumulator + size, 0)
}

export function downloadsDir(): string {
    const downloadPath = path.join(os.homedir(), 'Downloads')
    if (existsSync(downloadPath)) {
        return downloadPath
    } else {
        return os.tmpdir()
    }
}

/**
 * @deprecated use {@link fsCommon} exist methods instead.
 * Checks if file or directory `p` exists.
 *
 * TODO: optionally check read/write permissions and return a granular status.
 */
export async function fileExists(p: string): Promise<boolean> {
    try {
        return fsCommon.exists(p)
    } catch (err) {
        return false
    }

    return true
}

/**
 * @description Wraps readFileAsync and resolves the Buffer to a string for convenience
 *
 * @param filePath filename to read
 * @param encoding Optional - file encoding
 *
 * @returns the contents of the file as a string
 */
export async function readFileAsString(
    pathLike: string,
    options: { encoding: BufferEncoding; flag?: string } = { encoding: defaultEncoding }
): Promise<string> {
    return readFile(pathLike, options)
}

/**
 * Best-effort delete a folder recursively. Will not throw if it fails.
 * @param folder The path to the folder to delete
 */
export async function tryRemoveFolder(folder?: string): Promise<boolean> {
    try {
        // if null or empty, no issues
        if (!folder) {
            getLogger().warn('tryRemoveFolder: no folder given')
            return false
        }
        await remove(folder)
    } catch (err) {
        getLogger().warn('tryRemoveFolder: failed to delete directory "%s": %O', folder, err as Error)
        return false
    }
    return true
}

export const makeTemporaryToolkitFolder = async (...relativePathParts: string[]) => {
    if (relativePathParts.length === 0) {
        relativePathParts.push('vsctk')
    }

    const tmpPath = path.join(tempDirPath, ...relativePathParts)
    const tmpPathParent = path.dirname(tmpPath)
    // fs.makeTemporaryToolkitFolder fails on OSX if prefix contains path separator
    // so we must create intermediate dirs if needed
    await mkdirp(tmpPathParent)

    return await mkdtemp(tmpPath)
}

/**
 * Returns `true` if path `p` is a descendant of directory `d` (or if they are
 * identical).
 *
 * Only the logical structure is checked; the paths are not checked for
 * existence on the filesystem.
 *
 * @param d  Path to a directory.
 * @param p  Path to file or directory to test.
 */
export function isInDirectory(d: string, p: string): boolean {
    if (d === '' || p === '') {
        return true
    }
    const parentDirPieces = pathutils.normalizeSeparator(d).split('/')
    const containedPathPieces = pathutils.normalizeSeparator(p).split('/')

    if (parentDirPieces.length > containedPathPieces.length) {
        return false
    }

    // Remove final empty element(s), if `d` ends with slash(es).
    while (parentDirPieces.length > 0 && parentDirPieces[parentDirPieces.length - 1] === '') {
        parentDirPieces.pop()
    }
    const caseInsensitive = os.platform() === 'win32'

    return parentDirPieces.every((value, index) => {
        return caseInsensitive
            ? value.toLowerCase() === containedPathPieces[index].toLowerCase()
            : value === containedPathPieces[index]
    })
}

/**
 *
 * @returns file distance between fileA and fileB
 * For example:
 * The file distance between A/B/C.java and A/B/D.java is 0
 * The file distance between A/B/C.java and A/D.java is 1
 */
export function getFileDistance(fileA: string, fileB: string): number {
    let filePathA = pathutils.normalize(fileA).split('/')
    filePathA = filePathA.slice(0, filePathA.length - 1)

    let filePathB = pathutils.normalize(fileB).split('/')
    filePathB = filePathB.slice(0, filePathB.length - 1)

    let i = 0
    while (i < Math.min(filePathA.length, filePathB.length)) {
        const dir1 = filePathA[i]
        const dir2 = filePathB[i]

        if (dir1 !== dir2) {
            break
        }

        i++
    }

    return filePathA.slice(i).length + filePathB.slice(i).length
}

/**
 * Returns `name.suffix` if it does not already exist in directory `dir`, else appends
 * a number ("foo-1.txt", "foo-2.txt", etc.).
 *
 * To avoid excessive filesystem activity, if all filenames up to `max` exist,
 * the function instead appends a random string.
 *
 * @param dir  Path to a directory
 * @param name  Filename without extension
 * @param suffix  Filename suffix, typically an extension (".txt"), may be empty
 * @param max  Stop searching if all permutations up to this number exist
 */
export async function getNonexistentFilename(
    dir: string,
    name: string,
    suffix: string,
    max: number = 99
): Promise<string> {
    if (!name) {
        throw new Error(`name is empty`)
    }
    if (!(await fsCommon.directoryExists(dir))) {
        throw new Error(`directory does not exist: ${dir}`)
    }
    for (let i = 0; true; i++) {
        const filename =
            i === 0 ? `${name}${suffix}` : `${name}-${i < max ? i : crypto.randomBytes(4).toString('hex')}${suffix}`
        const fullpath = path.join(dir, filename)
        if (!(await fsCommon.fileExists(fullpath)) || i >= max + 99) {
            return filename
        }
    }
}

/**
 * @deprecated this is a synchronous duplicate of {@link getNonexistentFilename}. We are only keeping it
 * since some code needs to do this process synchronously and the platform agnostic file system is async.
 * 
 * Returns `name.suffix` if it does not already exist in directory `dir`, else appends
 * a number ("foo-1.txt", "foo-2.txt", etc.).
 *
 * To avoid excessive filesystem activity, if all filenames up to `max` exist,
 * the function instead appends a random string.
 *
 * @param dir  Path to a directory
 * @param name  Filename without extension
 * @param suffix  Filename suffix, typically an extension (".txt"), may be empty
 * @param max  Stop searching if all permutations up to this number exist
 */
export function getNonexistentFilenameSync(dir: string, name: string, suffix: string, max: number = 99): string {
    if (!name) {
        throw new Error(`name is empty`)
    }
    if (!fs.existsSync(dir)) {
        throw new Error(`directory does not exist: ${dir}`)
    }
    for (let i = 0; true; i++) {
        const filename =
            i === 0 ? `${name}${suffix}` : `${name}-${i < max ? i : crypto.randomBytes(4).toString('hex')}${suffix}`
        const fullpath = path.join(dir, filename)
        if (!fs.existsSync(fullpath) || i >= max + 99) {
            return filename
        }
    }
}

/**
 * Searches for existence of at least one file with the passed suffix
 * @param dir Directory to search
 * @param suffix Suffix to look for (ex.".ts")
 * @param exclude Pattern to ignore
 * @returns True if at least one file is found with given suffix
 */
export async function hasFileWithSuffix(dir: string, suffix: string, exclude?: vscode.GlobPattern): Promise<boolean> {
    const searchFolder = `${dir}**/*${suffix}`
    const matchedFiles = await vscode.workspace.findFiles(searchFolder, exclude, 1)
    return matchedFiles.length > 0
}

/**
 * TEMPORARY SHIM for vscode.workspace.findFiles() on Cloud9.
 *
 * @param dir Directory to search
 * @param fileName Name of file to locate
 * @returns  List of one or zero Uris (for compat with vscode.workspace.findFiles())
 */
export async function cloud9Findfile(dir: string, fileName: string): Promise<vscode.Uri[]> {
    const files = await fsCommon.readdir(dir)
    const subDirs: vscode.Uri[] = []
    for (const file of files) {
        const [currentFileName] = file
        const filePath = path.join(dir, currentFileName)
        if (filePath === path.join(dir, fileName)) {
            return [vscode.Uri.file(filePath)]
        }
        if (await fsCommon.directoryExists(filePath)) {
            subDirs.push(vscode.Uri.file(filePath))
        }
    }
    for (const d of subDirs) {
        const found = await cloud9Findfile(d.fsPath, fileName)
        if (found.length > 0) {
            return found
        }
    }
    return []
}
/**
 * @returns  A string path to the last locally stored download location. If none, returns the users 'Downloads' directory path.
 */
export function getDefaultDownloadPath(): string {
    const lastUsedPath = globals.context.globalState.get('aws.downloadPath')
    if (lastUsedPath) {
        if (typeof lastUsedPath === 'string') {
            return lastUsedPath
        }
        getLogger().error('Expected "aws.downloadPath" to be string, got %O', typeof lastUsedPath)
    }
    return downloadsDir()
}

export async function setDefaultDownloadPath(downloadPath: string) {
    try {
        if (await fsCommon.directoryExists(downloadPath)) {
            GlobalState.instance.tryUpdate('aws.downloadPath', downloadPath)
        } else {
            GlobalState.instance.tryUpdate('aws.downloadPath', path.dirname(downloadPath))
        }
    } catch (err) {
        getLogger().error('Error while setting "aws.downloadPath"', err as Error)
    }
}
