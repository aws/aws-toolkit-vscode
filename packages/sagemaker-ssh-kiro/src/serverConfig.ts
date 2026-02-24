/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This file contains code originally from https://github.com/jeanp413/open-remote-ssh
 * Original copyright: (c) 2022
 * Originally released under MIT license
 */

import * as vscode from 'vscode'
import * as fs from 'fs' // eslint-disable-line no-restricted-imports
import * as path from 'path'

let vscodeProductJson: any
async function getVSCodeProductJson() {
    if (!vscodeProductJson) {
        const productJsonStr = await fs.promises.readFile(path.join(vscode.env.appRoot, 'product.json'), 'utf8')
        vscodeProductJson = JSON.parse(productJsonStr)
    }

    return vscodeProductJson
}

export interface IServerConfig {
    version: string
    commit: string
    quality: string
    serverApplicationName: string
    serverDataFolderName: string
    serverDownloadUrlTemplate?: string
}

export async function getVSCodeServerConfig(): Promise<IServerConfig> {
    const productJson = await getVSCodeProductJson()

    return {
        version: vscode.version.replace('-insider', ''),
        commit: productJson.commit,
        quality: productJson.quality,
        serverApplicationName: productJson.serverApplicationName,
        serverDataFolderName: productJson.serverDataFolderName,
        serverDownloadUrlTemplate: productJson.serverDownloadUrlTemplate,
    }
}
