/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// import { IncomingHttpHeaders } from 'http'
// import { get } from 'https'
import { Memento, window } from 'vscode'
import { ext } from '../shared/extensionGlobals'
import { mkdir, writeFile } from '../shared/filesystem'
import { fileExists } from '../shared/filesystemUtilities'
import { getLogger, Logger } from '../shared/logger'
import * as request from 'request'

const VISUALIZATION_SCRIPT_URL = 'https://d19z89qxwgm7w9.cloudfront.net/sfn-0.0.3.js'
const VISUALIZATION_CSS_URL = 'https://d19z89qxwgm7w9.cloudfront.net/graph-0.0.1.css'

export const SCRIPTS_LAST_DOWNLOAD_DATE = 'SCRIPT_LAST_DOWNLOAD_DATE'
export const CSS_LAST_DOWNLOAD_DATE = 'CSS_LAST_DOWNLOAD_DATE'

// interface httpsGetRequestWrapperResponse {
//     headers: IncomingHttpHeaders
//     data: string
// }

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
    try {
        await Promise.all([updateGraphScript(globalStorage), updateCSS(globalStorage)])
    } catch (err) {
        if (err instanceof NetworkError) {
            if (await filesExist()) {
                window.showInformationMessage(
                    'Network error. Failed to update graphing scripts. Using local cache instead.'
                )

                return
            } else {
                window.showErrorMessage(
                    'Network error. Failed to get the graphing scripts to render state machine definition. No local cache found.'
                )
            }
        } else if (err instanceof WritingError) {
            window.showErrorMessage(err.message)
        }

        throw err
    }
}

export async function filesExist() {
    return (
        (await fileExists(ext.visualizationResourcePaths.visualizationLibraryScript.fsPath)) &&
        (await fileExists(ext.visualizationResourcePaths.visualizationLibraryCSS.fsPath))
    )
}

export async function isCacheStale(
    cacheLastModifiedDate: number | undefined,
    fileLastModified: string | undefined
): Promise<boolean> {
    if (cacheLastModifiedDate === undefined || fileLastModified === undefined) {
        return true
    }

    if (!(await filesExist())) {
        return true
    }

    const fileLastModifiedDateTime = new Date(fileLastModified)
    if (fileLastModifiedDateTime.getTime() > cacheLastModifiedDate) {
        return true
    }

    return false
}

async function writeToLocalStorage(destinationPath: string, data: string): Promise<void> {
    const logger: Logger = getLogger()

    const storageFolder = ext.visualizationResourcePaths.visualizationLibraryCachePath.fsPath

    if (!(await fileExists(storageFolder))) {
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

export async function updateGraphScript(globalStorage: Memento): Promise<void> {
    const scriptDownloadDate = globalStorage.get<number>(SCRIPTS_LAST_DOWNLOAD_DATE)

    const response = await httpsGetRequestWrapper(VISUALIZATION_SCRIPT_URL)

    if (await isCacheStale(scriptDownloadDate, response.headers['last-modified'])) {
        await writeToLocalStorage(ext.visualizationResourcePaths.visualizationLibraryScript.fsPath, response.body)
        globalStorage.update(SCRIPTS_LAST_DOWNLOAD_DATE, Date.now())
    }
}

export async function updateCSS(globalStorage: Memento): Promise<void> {
    const cssDownloadDate = globalStorage.get<number>(CSS_LAST_DOWNLOAD_DATE)

    const response = await httpsGetRequestWrapper(VISUALIZATION_CSS_URL)

    if (await isCacheStale(cssDownloadDate, response.headers['last-modified'])) {
        await writeToLocalStorage(ext.visualizationResourcePaths.visualizationLibraryCSS.fsPath, response.body)
        globalStorage.update(CSS_LAST_DOWNLOAD_DATE, Date.now())
    }
}

async function httpsGetRequestWrapper(url: string): Promise<request.Response> {
    // const logger: Logger = getLogger()

    return new Promise((resolve, reject) => {
        request(url, function(error, response) {
            if (error) {
                reject(error)
            } else {
                resolve(response)
            }
        })
    })

    // return new Promise<httpsGetRequestWrapperResponse>((resolve, reject) => {
    //     get(url, (response) => {
    //         const { statusCode, headers } = response

    //         if (statusCode !== 200) {
    //             /*
    //              * Received a response but was unable to pull latest script from CloudFront
    //              * Likely an error with the CDN
    //              */
    //             const errorMessage = `Unable to get the required file from ${url}.\n Request Failed with status code: ${statusCode}.`
    //             logger.error(errorMessage)
    //             reject(new NetworkError(errorMessage))

    //             return
    //         }

    //         let responseData = ''

    //         /*
    //          * Code on the repository is encoded as Windows-1252
    //          * Need to set encoding to binary or else there will be very small differences
    //          * between the code on CloudFront and the response string here.
    //          * https://stackoverflow.com/questions/37128883/encode-a-string-using-windows-1252-in-node-js
    //          */
    //         response.setEncoding('binary')

    //         response.on('data', (chunk) => {
    //             responseData += chunk
    //         });

    //         response.on('end', () => {
    //             resolve({
    //                 headers: headers,
    //                 data: responseData
    //             })
    //         });
    //     }).on('error', (err) => {
    //         // HTTPS get error. A user not having an internet connection would cause it to error here.
    //         const errorMessage = `Unable to reach CloudFront to download the necessary files to render state machine.\n Error: ${err.message}`
    //         logger.error(errorMessage)
    //         reject(new NetworkError(errorMessage))
    //     })
    // })
}
