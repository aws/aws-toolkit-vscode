/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { access, mkdtemp, readFile } from 'fs-extra'
import * as os from 'os'
import * as path from 'path'
import { mkdir } from './filesystem'

const DEFAULT_ENCODING: BufferEncoding = 'utf8'

export const tempDirPath = path.join(
    // https://github.com/aws/aws-toolkit-vscode/issues/240
    os.type() === 'Darwin' ? '/tmp' : os.tmpdir(),
    'aws-toolkit-vscode'
)

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
 * Searches for fileToFind, starting in searchFolder and working up the parent folder chain.
 * If file is not found, undefined is returned.
 */
export async function findFileInParentPaths(searchFolder: string, fileToFind: string): Promise<string | undefined> {
    const targetFilePath: string = path.join(searchFolder, fileToFind)

    if (await fileExists(targetFilePath)) {
        return targetFilePath
    }

    const parentPath = path.dirname(searchFolder)

    if (!parentPath || parentPath === searchFolder) {
        return undefined
    }

    return findFileInParentPaths(parentPath, fileToFind)
}

export const makeTemporaryToolkitFolder = async (...relativePathParts: string[]) => {
    if (relativePathParts.length === 0) {
        relativePathParts.push('vsctk')
    }

    const tmpPath = path.join(tempDirPath, ...relativePathParts)
    const tmpPathParent = path.dirname(tmpPath)
    // fs.makeTemporaryToolkitFolder fails on OSX if prefix contains path separator
    // so we must create intermediate dirs if needed
    if (!(await fileExists(tmpPathParent))) {
        await mkdir(tmpPathParent, { recursive: true })
    }

    return mkdtemp(tmpPath)
}

/**
 * Returns `true` if path `p` is contained by directory `d` (which includes the
 * case where they are identical).
 *
 * Only the logical structure is checked; the paths are not checked for
 * existence on the filesystem.
 *
 * @param d  Path to a directory.
 * @param p  Path to file or directory to test.
 */
export function isInDirectory(d: string, p: string): boolean {
    const parentDirPieces = d.split(path.sep)
    const containedPathPieces = p.split(path.sep)

    return parentDirPieces.every((value, index) => {
        return value === containedPathPieces[index]
    })
}
