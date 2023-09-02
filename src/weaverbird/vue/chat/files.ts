/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
import * as path from 'path'
import { FileMetadata } from '../../client/weaverbirdclient'

export async function collectFiles(rootPath: string, prefix: string, storage: FileMetadata[]) {
    const fileList = fs.readdirSync(rootPath)

    fileList.forEach(filePath => {
        const realPath = path.join(rootPath, filePath)
        // llms are fine-tuned to use posix path. Don't expect miracles otherwise
        const posixPath = path.posix.join(prefix, filePath)
        if (fs.lstatSync(realPath).isDirectory()) {
            collectFiles(realPath, posixPath, storage)
        } else {
            storage.push({
                filePath: posixPath,
                fileContent: fs.readFileSync(realPath).toString(),
            } as FileMetadata)
        }
    })
}

// used for reading the mocked files from workspace
export function readFilesRecursive(rootPath: string, results: string[] = []) {
    const fileList = fs.readdirSync(rootPath)
    for (const file of fileList) {
        const name = `${rootPath}/${file}`
        if (fs.statSync(name).isDirectory()) {
            readFilesRecursive(name, results)
        } else {
            results.push(name)
        }
    }
    return results
}
