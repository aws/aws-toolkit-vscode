/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// import { IncomingHttpHeaders } from 'http'
// import { get } from 'https'
import * as request from 'request'
import { Memento } from 'vscode'
import { ext } from '../shared/extensionGlobals'
import { mkdir, writeFile } from '../shared/filesystem'
import { fileExists } from '../shared/filesystemUtilities'
import { getLogger, Logger } from '../shared/logger'

const VISUALIZATION_SCRIPT_URL = 'https://d19z89qxwgm7w9.cloudfront.net/sfn-0.0.3.js'
const VISUALIZATION_CSS_URL = 'https://d19z89qxwgm7w9.cloudfront.net/graph-0.0.1.css'

export const SCRIPTS_LAST_DOWNLOADED_URL = 'SCRIPT_LAST_DOWNLOADED_URL'
export const CSS_LAST_DOWNLOADED_URL = 'CSS_LAST_DOWNLOADED_URL'

interface UpdateCachedScriptOptions {
    globalStorage: Memento
    lastDownloadedURLKey: string
    currentURL: string
    filePath: string
}

export async function updateCache(globalStorage: Memento): Promise<void> {
    const logger: Logger = getLogger()

    const scriptUpdate = updateCachedFile({
        globalStorage,
        lastDownloadedURLKey: SCRIPTS_LAST_DOWNLOADED_URL,
        currentURL: VISUALIZATION_SCRIPT_URL,
        filePath: ext.visualizationResourcePaths.visualizationLibraryScript.fsPath
    }).catch(error => {
        logger.debug('Failed to update State Machine Graph script assets')

        throw error
    })

    const cssUpdate = updateCachedFile({
        globalStorage,
        lastDownloadedURLKey: CSS_LAST_DOWNLOADED_URL,
        currentURL: VISUALIZATION_CSS_URL,
        filePath: ext.visualizationResourcePaths.visualizationLibraryCSS.fsPath
    }).catch(error => {
        logger.debug('Failed to update State Machine Graph css assets')

        throw error
    })

    await Promise.all([scriptUpdate, cssUpdate])
}

async function writeToLocalStorage(destinationPath: string, data: string): Promise<void> {
    const logger: Logger = getLogger()

    const storageFolder = ext.visualizationResourcePaths.visualizationLibraryCachePath.fsPath

    if (!(await fileExists(storageFolder))) {
        logger.debug('Folder for graphing script and styling doesnt exist. Creating it.')

        try {
            await mkdir(storageFolder)
        } catch (err) {
            logger.error(err as Error)

            throw err
        }
    }

    try {
        await writeFile(destinationPath, data, 'utf8')
    } catch (err) {
        /*
         * Was able to download the required files,
         * but there was an error trying to write them to this extensions globalStorage location.
         */
        logger.error(err as Error)

        throw err
    }
}

export async function updateCachedFile(options: UpdateCachedScriptOptions) {
    const logger: Logger = getLogger()
    const downloaedUrl = options.globalStorage.get<string>(options.lastDownloadedURLKey)
    const cachedFileExists = await fileExists(options.filePath)

    // if current url is different than url that was previously used to download the assets
    // or if the file assets do not exist
    // download and cache the assets
    if (downloaedUrl !== options.currentURL || !cachedFileExists) {
        const response = await httpsGetRequestWrapper(options.currentURL).catch(err => {
            logger.error(err as Error)

            throw err
        })

        await writeToLocalStorage(options.filePath, response.body as string).catch(err => {
            logger.error(err as Error)

            throw err
        })

        // save the url of the downloaded and cached assets
        options.globalStorage.update(options.lastDownloadedURLKey, options.currentURL)
    }
}

async function httpsGetRequestWrapper(url: string): Promise<request.Response> {
    return new Promise((resolve, reject) => {
        request(url, function(error, response) {
            if (error) {
                reject(error)
            } else {
                resolve(response)
            }
        })
    })
}
