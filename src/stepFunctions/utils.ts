/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
import * as https from 'https'
import { Memento, window } from 'vscode'
import { ext } from '../shared/extensionGlobals'
import { getLogger, Logger } from '../shared/logger'

const VISUALIZATION_SCRIPT_URL = 'https://d19z89qxwgm7w9.cloudfront.net/sfn-0.0.3.js'
const VISUALIZATION_CSS_URL = 'https://d19z89qxwgm7w9.cloudfront.net/graph-0.0.1.css'

const ONE_DAY_MILLISECONDS = 60 * 60 * 24 * 1000

export const SCRIPTS_LAST_DOWNLOAD_DATE = 'SCRIPTS_LAST_DOWNLOAD_DATE'

enum fileOptions {
    graphScript = 'graph.js',
    graphStyle = 'graph.css'
}

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
        return Promise.all([getGraphScript(), getGraphCSS()]).then( () => {
            globalStorage.update(SCRIPTS_LAST_DOWNLOAD_DATE, Date.now())
        }).catch((err: Error)=> {
            if (err instanceof NetworkError) {
                if (filesExist()) {
                    window.showInformationMessage('Encountered a network error trying to update graphing scripts, falling back to local cache. These files may be out of date.')
                } else {
                    window.showErrorMessage('Unable to pull the necessary graphing scripts to render state machine definition due to a network error. No local cache to fall back on.')
                }
            } else if (err instanceof WritingError) {
                window.showErrorMessage(err.message)
            }

            throw err
        })
    }
}

export function filesExist() {
    return  fs.existsSync(ext.visualizationResourcePaths.visualizationScript.fsPath) &&
            fs.existsSync(ext.visualizationResourcePaths.visualizationCSS.fsPath)
}

export function isCacheStale(lastUpdateDate: number): boolean {
    return Date.now() - lastUpdateDate > ONE_DAY_MILLISECONDS
}

function writeToLocalStorage(file: string): (data: string) => void {
    const logger: Logger = getLogger()

    // TODO: Better style?
    let fileToWrite: string

    if (file === fileOptions.graphScript) {
        fileToWrite = ext.visualizationResourcePaths.visualizationScript.fsPath
    } else if(file === fileOptions.graphStyle) {
        fileToWrite = ext.visualizationResourcePaths.visualizationCSS.fsPath
    } else {
        throw new Error('Invalid write file option')
    }

    const storageFolder = ext.visualizationResourcePaths.visualizationCache.fsPath

    if (!fs.existsSync(storageFolder)) {
        logger.debug('Folder for graphing script and styling doesnt exist. Creating it.')
        fs.mkdirSync(storageFolder)
    }

    return (data: string) => {
        fs.writeFile(fileToWrite, data, 'utf8', (err) => {
            /*
             * Was able to download the required files,
             * but there was an error trying to write them to this extensions globalStorage location.
             */
            logger.error(err)
            const errorMessage = `Unable to write data at: ${fileToWrite}\nError: ${err.message}`

            throw new WritingError(errorMessage)
        })
    }
}

export async function getGraphScript(): Promise<void> {
    await httpGetRequestWrapper(
        VISUALIZATION_SCRIPT_URL,
        writeToLocalStorage(fileOptions.graphScript)
    )
}

export async function getGraphCSS(): Promise<void> {
    await httpGetRequestWrapper(
        VISUALIZATION_CSS_URL,
        writeToLocalStorage(fileOptions.graphStyle)
    )
}

async function httpGetRequestWrapper(
    url: string,
    updatePersistantStorage: (data: string) => void
): Promise<void> {
    const logger: Logger = getLogger()

    await new Promise<string>((resolve, reject) => {
        https.get(url, (response) => {
            const { statusCode } = response

            if (statusCode !== 200) {
                /*
                 * Received a response but was unable to pull latest script from CloudFront
                 * Likely an error with the CDN
                 */
                const errorMessage = `Unable to get the required files from CloudFront.\n Request Failed with status code: ${statusCode}.`
                logger.error(errorMessage)
                reject(new NetworkError(errorMessage))

                return
            }

            let cloudFrontData = ''

            /*
             * Code on the repository is encoded as Windows-1252
             * Need to set encoding to binary or else there will be very small differences
             * between the code on CloudFront and the response string here.
             * https://stackoverflow.com/questions/37128883/encode-a-string-using-windows-1252-in-node-js
             */
            response.setEncoding('binary')

            response.on('data', (chunk) => {
                cloudFrontData += chunk
            });

            response.on('end', () => {
                // Update cache with latest data
                try {
                    updatePersistantStorage(cloudFrontData)
                } catch (err) {
                    reject(err)

                    return
                }
                resolve()
            });
        }).on('error', (err) => {
            // HTTPS get error. A user not having an internet connection would cause it to error here.
            const errorMessage = `Unable to reach CloudFront to download the necessary files to render state machine.\n Error: ${err.message}`
            logger.error(errorMessage)
            reject(new NetworkError(errorMessage))
        })
    })
}
