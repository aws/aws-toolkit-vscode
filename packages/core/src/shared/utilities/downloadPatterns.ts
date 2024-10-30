/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import fetch from 'node-fetch'
import fs from '../fs/fs'
import AdmZip from 'adm-zip'
import { getLogger } from '../logger/logger'
import * as vscode from 'vscode'
import * as path from 'path'
import { ToolkitError } from '..'

// Get pattern code and save it in temporary folder
async function fetchUrl(owner: string, repoName: string, assetName: string): Promise<Buffer> {
    const url = `https://github.com/${owner}/${repoName}/releases/latest/download/${assetName}`
    getLogger().info(`Fetching URL: ${url}`)

    const response = await fetch(url)
    if (!response.ok) {
        getLogger().error(`Failed to fetch the latest release: ${response.statusText}`)
        throw new ToolkitError(`Failed to fetch the latest release: ${response.statusText}`)
    }
    return Buffer.from(await response.arrayBuffer())
}

/**
 * Asynchronously extracts a ZIP file from a buffer into a specified directory, with optional removal
 * of the top-level directory from the extracted paths. Pattern in this case refers to sample application
 * patterns like those found in Serverlessland or other AWS repositories.
 *
 */
async function unzipPattern(buffer: Buffer, outputDir: vscode.Uri, removeTopDir: boolean): Promise<void> {
    const zip = new AdmZip(buffer)
    const zipEntries = zip.getEntries()

    try {
        await Promise.all(
            zipEntries.map(async (entry) => {
                let subPath = entry.entryName
                // Admzip won't change path sep based on system type
                const pathArray = entry.entryName.split('/')
                if (removeTopDir) {
                    // remove top dir
                    pathArray.shift()
                }
                subPath = pathArray.join(path.sep)
                const entryPath = vscode.Uri.joinPath(outputDir, subPath)

                if (!(await fs.existsDir(entryPath))) {
                    if (entry.isDirectory) {
                        await fs.mkdir(entryPath)
                    } else {
                        const fileData = entry.getData()
                        await fs.writeFile(entryPath, fileData)
                    }
                } else {
                    if (!entry.isDirectory) {
                        // the file we are creating has the same name of an exising dir
                        getLogger().warn(`${entryPath.fsPath} skipped: Existing folder has conflicting name`)
                    }
                }
            })
        )
    } catch (err) {
        getLogger().error(`Error decompressing zip file: ${err}`)
        throw new ToolkitError(`Error decompressing zip file: ${err}`)
    }
}

export async function getPattern(
    owner: string,
    repoName: string,
    assetName: string,
    outputDir: vscode.Uri,
    removeTopDir: boolean = false
) {
    const data = await fetchUrl(owner, repoName, assetName)
    await unzipPattern(data, outputDir, removeTopDir)
    getLogger().info(`Decompressed files are saved in ${outputDir.fsPath}`)
}
