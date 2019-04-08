/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as os from 'os'
import * as path from 'path'
import * as tmp from 'tmp' // 'tmp-promise' failed due to types being out of sync with 'tmp'
import { access, mkdir, PathLike, readdir, readFile } from './filesystem'

tmp.setGracefulCleanup()

const DEFAULT_ENCODING: BufferEncoding = 'utf8'

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

let tmpDirRoot: string // lazily initialized
export async function getTemporaryToolkitFolderRoot() {
    if (!tmpDirRoot /* never initialized */ || !await fileExists(tmpDirRoot) /* has been deleted */) {
        const _tempDirPath = path.join(
            // https://github.com/aws/aws-toolkit-vscode/issues/240
            os.type() === 'Darwin' ? '/tmp' : os.tmpdir(),
            'aws-toolkit-vscode'
        )
        tmpDirRoot = await new Promise<string>((resolve, reject) => {
            tmp.dir(
                {
                     dir: _tempDirPath,
                 },
                (err: Error, _path: string) => {
                    if (err) {
                        reject(err)
                    }
                    resolve(_path)
                }
            )
        })
    }

    return tmpDirRoot
}

export const  makeTemporaryToolkitFolder = async (...relativePathParts: string[]) => {
    const _relativePathParts = relativePathParts || ['vsctk']
    const tmpPath = path.join(await getTemporaryToolkitFolderRoot(), ..._relativePathParts)
    if (!await fileExists(tmpPath)) {
        await mkdir(tmpPath)
    }

    return tmpPath
}
