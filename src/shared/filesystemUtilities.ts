/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { access, mkdtemp, mkdirp, readFile, remove, existsSync } from 'fs-extra'
import * as crypto from 'crypto'
import * as fs from 'fs'
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

export function downloadsDir(): string {
    const downloadPath = path.join(os.homedir(), 'Downloads')
    if (existsSync(downloadPath)) {
        return downloadPath
    } else {
        return os.tmpdir()
    }
}

export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await access(filePath)
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
export async function tryRemoveFolder(folder?: string) {
    try {
        // if null or empty, no issues
        if (!folder) {
            getLogger().warn(`No folder passed into tryRemoveFolder: ${folder}`)
            return
        }
        await remove(folder)
    } catch (err) {
        getLogger().warn(`tryRemoveFolder: failed to delete directory '%s': %O`, folder, err as Error)
    }
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
        const filename = i == 0
            ? `${name}${suffix}`
            : `${name}-${i < max ? i : crypto.randomBytes(4).toString('hex')}${suffix}`
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
     return (matchedFiles.length > 0)
}
