/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { promisify } from 'util'
import { access, mkdir, PathLike, readdir, readFile } from './filesystem'

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

export const readDirAsString = async (
    pathLike: PathLike,
    options: { encoding: BufferEncoding } = { encoding: DEFAULT_ENCODING }
): Promise<string[]> => {
    return readdir(pathLike, options)
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
    options: { encoding: BufferEncoding, flag?: string } = { encoding: DEFAULT_ENCODING }
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

const mkdtemp = promisify(fs.mkdtemp)
export const makeTemporaryToolkitFolder = async (...relativePathParts: string[]) => {
    const _relativePathParts = relativePathParts || []
    if (_relativePathParts.length === 0) {
        _relativePathParts.push('vsctk')
    }

    const tmpPath = path.join(tempDirPath, ..._relativePathParts)
    const tmpPathParent = path.dirname(tmpPath)
    // fs.makeTemporaryToolkitFolder fails on OSX if prefix contains path separator
    // so we must create intermediate dirs if needed
    if (!await fileExists(tmpPathParent)) {
        await mkdir(tmpPathParent, { recursive: true })
    }

    return mkdtemp(tmpPath)
}
