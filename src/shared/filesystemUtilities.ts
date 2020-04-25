/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { access, mkdtemp, readFile } from 'fs-extra'
import * as os from 'os'
import * as path from 'path'
import { mkdir } from './filesystem'
import * as pathutils from './utilities/pathUtils'

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
