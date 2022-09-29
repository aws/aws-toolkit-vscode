/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { access, mkdtemp, mkdirp, readFile, remove, existsSync, readdir, stat } from 'fs-extra'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as fsExtra from 'fs-extra'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { getLogger } from './logger'
import * as pathutils from './utilities/pathUtils'

const DEFAULT_ENCODING: BufferEncoding = 'utf8'

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
    const files = await fsExtra.readdir(dirPath, { withFileTypes: true })
    const fileSizes = files.map(async file => {
        const filePath = path.join(dirPath, file.name)
        if (file.isSymbolicLink()) return 0
        if (file.isDirectory()) return getDirSize(filePath, startTime, duration, fileExt)
        if (file.isFile() && file.name.endsWith(fileExt)) {
            const { size } = await fsExtra.stat(filePath)
            return size
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
 * Checks if file or directory `p` exists.
 *
 * TODO: optionally check read/write permissions and return a granular status.
 */
export async function fileExists(p: string): Promise<boolean> {
    try {
        await access(p)
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
export const readFileAsString = async (
    pathLike: string,
    options: { encoding: BufferEncoding; flag?: string } = { encoding: DEFAULT_ENCODING }
): Promise<string> => {
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
export function getNonexistentFilename(dir: string, name: string, suffix: string, max: number = 99): string {
    if (!name) {
        throw new Error(`name is empty`)
    }
    if (!fs.existsSync(dir)) {
        throw new Error(`directory does not exist: ${dir}`)
    }
    for (let i = 0; true; i++) {
        const filename =
            i == 0 ? `${name}${suffix}` : `${name}-${i < max ? i : crypto.randomBytes(4).toString('hex')}${suffix}`
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
    const files = await readdir(dir)
    const subDirs: vscode.Uri[] = []
    for (const file of files) {
        const filePath = path.join(dir, file)
        if (filePath === path.join(dir, fileName)) {
            return [vscode.Uri.file(filePath)]
        }
        if ((await stat(filePath)).isDirectory()) {
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
