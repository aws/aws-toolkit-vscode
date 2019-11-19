/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { get } from 'https'
import { Memento, window } from 'vscode'
import { ext } from '../shared/extensionGlobals'
import { mkdir, writeFile } from '../shared/filesystem'
import { fileExists } from '../shared/filesystemUtilities'
import { getLogger, Logger } from '../shared/logger'

const VISUALIZATION_SCRIPT_URL = 'https://d19z89qxwgm7w9.cloudfront.net/sfn-0.0.3.js'
const VISUALIZATION_CSS_URL = 'https://d19z89qxwgm7w9.cloudfront.net/graph-0.0.1.css'

const ONE_DAY_MILLISECONDS = 60 * 60 * 24 * 1000

export const SCRIPTS_LAST_DOWNLOAD_DATE = 'SCRIPTS_LAST_DOWNLOAD_DATE'

export class CachingError extends Error {
    public constructor(message?: string | undefined) {
        super(message)
    }
}

export class NetworkError extends CachingError {
    public constructor(message?: string | undefined) {
        super(message)
    }
}

export class WritingError extends CachingError {
    public constructor(message?: string | undefined) {
        super(message)
    }
}

export async function updateCache(globalStorage: Memento): Promise<void> {
    const scriptsDownloadDate = globalStorage.get<number>(SCRIPTS_LAST_DOWNLOAD_DATE)

    if (
        scriptsDownloadDate === undefined ||
        !filesExist() ||
        isCacheStale(scriptsDownloadDate)
    ) {
        try {
            await Promise.all([getGraphScript(), getGraphCSS()])
            globalStorage.update(SCRIPTS_LAST_DOWNLOAD_DATE, Date.now())
        } catch (err) {
            if (err instanceof NetworkError) {
                if (filesExist()) {
                    window.showInformationMessage('Network error. Failed to update graphing scripts. Using local cache instead.')

                    return
                } else {
                    window.showErrorMessage('Network error. Failed to get the graphing scripts to render state machine definition. No local cache found.')
                }
            } else if (err instanceof WritingError) {
                window.showErrorMessage(err.message)
            }

            throw err
        }
    }
}

export async function filesExist() {
    return await fileExists(ext.visualizationResourcePaths.visualizationScript.fsPath) &&
        await fileExists(ext.visualizationResourcePaths.visualizationCSS.fsPath)
}

export function isCacheStale(lastUpdateDate: number): boolean {
    return Date.now() - lastUpdateDate > ONE_DAY_MILLISECONDS
}

async function writeToLocalStorage(destinationPath: string, data: string): Promise<void> {
    const logger: Logger = getLogger()

    const storageFolder = ext.visualizationResourcePaths.visualizationCache.fsPath

    // if (!fs.existsSync(storageFolder)) {
    if (!fileExists(storageFolder)) {
        logger.debug('Folder for graphing script and styling doesnt exist. Creating it.')
        await mkdir(storageFolder)
    }

    try {
        await writeFile(destinationPath, data, 'utf8')
    } catch (err) {
        /*
         * Was able to download the required files,
         * but there was an error trying to write them to this extensions globalStorage location.
         */
        logger.error(err as Error)
        const errorMessage = `Unable to write data at: ${destinationPath}\nError: ${(err as Error).message}`

        throw new WritingError(errorMessage)
    }
}

export async function getGraphScript(): Promise<void> {
    const data = await httpsGetRequestWrapper(VISUALIZATION_SCRIPT_URL)
    await writeToLocalStorage(ext.visualizationResourcePaths.visualizationScript.fsPath, data)
}

export async function getGraphCSS(): Promise<void> {
    const data = await httpsGetRequestWrapper(VISUALIZATION_CSS_URL)
    await writeToLocalStorage(ext.visualizationResourcePaths.visualizationCSS.fsPath, data)
}

async function httpsGetRequestWrapper(url: string): Promise<string> {
    const logger: Logger = getLogger()

    return new Promise<string>((resolve, reject) => {
        get(url, (response) => {
            const { statusCode } = response

            if (statusCode !== 200) {
                /*
                 * Received a response but was unable to pull latest script from CloudFront
                 * Likely an error with the CDN
                 */
                const errorMessage = `Unable to get the required file from ${url}.\n Request Failed with status code: ${statusCode}.`
                logger.error(errorMessage)
                reject(new NetworkError(errorMessage))

                return
            }

            let responseData = ''

            /*
             * Code on the repository is encoded as Windows-1252
             * Need to set encoding to binary or else there will be very small differences
             * between the code on CloudFront and the response string here.
             * https://stackoverflow.com/questions/37128883/encode-a-string-using-windows-1252-in-node-js
             */
            response.setEncoding('binary')

            response.on('data', (chunk) => {
                responseData += chunk
            });

            response.on('end', () => {
                resolve(responseData)
            });
        }).on('error', (err) => {
            // HTTPS get error. A user not having an internet connection would cause it to error here.
            const errorMessage = `Unable to reach CloudFront to download the necessary files to render state machine.\n Error: ${err.message}`
            logger.error(errorMessage)
            reject(new NetworkError(errorMessage))
        })
    })
}
