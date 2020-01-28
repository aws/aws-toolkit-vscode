/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// import { IncomingHttpHeaders } from 'http'
// import { get } from 'https'
import { writeFile } from 'fs-extra'
import * as request from 'request'
import { Memento } from 'vscode'
import { ext } from '../shared/extensionGlobals'
import { mkdir } from '../shared/filesystem'
import { fileExists } from '../shared/filesystemUtilities'
import { getLogger } from '../shared/logger'

export const VISUALIZATION_SCRIPT_URL = 'https://d19z89qxwgm7w9.cloudfront.net/sfn-0.0.3.js'
export const VISUALIZATION_CSS_URL = 'https://d19z89qxwgm7w9.cloudfront.net/graph-0.0.1.css'

export const SCRIPTS_LAST_DOWNLOADED_URL = 'SCRIPT_LAST_DOWNLOADED_URL'
export const CSS_LAST_DOWNLOADED_URL = 'CSS_LAST_DOWNLOADED_URL'

export interface UpdateCachedScriptOptions {
    globalStorage: Memento
    lastDownloadedURLKey: string
    currentURL: string
    filePath: string
}

interface CustomLogger {
    error(message: string | Error): void
    debug(message: string): void
}

export interface StateMachineGraphCacheOptions {
    cssFilePath?: string
    jsFilePath?: string
    dirPath?: string
    scriptUrl?: string
    cssUrl?: string
    logger?: CustomLogger
    writeFile?(path: string, data: string, encoding: string): Promise<void>
    makeDir?(path: string): Promise<void>
    getFileData?(url: string): Promise<string>
    fileExists?(path: string): Promise<boolean>
}

export default class StateMachineGraphCache {
    protected makeDir: (path: string) => Promise<void>
    protected writeFile: (path: string, data: string, encoding: string) => Promise<void>
    protected getFileData: (url: string) => Promise<string>
    protected fileExists: (path: string) => Promise<boolean>
    protected logger: CustomLogger
    protected cssFilePath: string
    protected jsFilePath: string
    protected dirPath: string

    public constructor(options: StateMachineGraphCacheOptions = {}) {
        const {
            makeDir,
            writeFile: writeFileCustom,
            logger: loggerCustom,
            getFileData,
            fileExists: fileExistsCustom
        } = options

        this.makeDir = makeDir ?? mkdir
        this.writeFile = writeFileCustom ?? writeFile
        this.logger = loggerCustom ?? getLogger()
        this.getFileData = getFileData ?? httpsGetRequestWrapper
        this.cssFilePath = options.cssFilePath ?? ext.visualizationResourcePaths.visualizationLibraryCSS.fsPath
        this.jsFilePath = options.jsFilePath ?? ext.visualizationResourcePaths.visualizationLibraryScript.fsPath
        this.dirPath = options.dirPath ?? ext.visualizationResourcePaths.visualizationLibraryCachePath.fsPath
        this.fileExists = fileExistsCustom ?? fileExists
    }

    public async updateCache(globalStorage: Memento): Promise<void> {
        const scriptUpdate = this.updateCachedFile({
            globalStorage,
            lastDownloadedURLKey: SCRIPTS_LAST_DOWNLOADED_URL,
            currentURL: VISUALIZATION_SCRIPT_URL,
            filePath: this.jsFilePath
        }).catch(error => {
            this.logger.error('Failed to update State Machine Graph script assets')

            throw error
        })

        const cssUpdate = this.updateCachedFile({
            globalStorage,
            lastDownloadedURLKey: CSS_LAST_DOWNLOADED_URL,
            currentURL: VISUALIZATION_CSS_URL,
            filePath: this.cssFilePath
        }).catch(error => {
            this.logger.error('Failed to update State Machine Graph css assets')

            throw error
        })

        await Promise.all([scriptUpdate, cssUpdate])
    }

    public async updateCachedFile(options: UpdateCachedScriptOptions) {
        const downloadedUrl = options.globalStorage.get<string>(options.lastDownloadedURLKey)
        const cachedFileExists = await this.fileExists(options.filePath)

        // if current url is different than url that was previously used to download the assets
        // or if the file assets do not exist
        // download and cache the assets
        if (downloadedUrl !== options.currentURL || !cachedFileExists) {
            const response = await this.getFileData(options.currentURL).catch(err => {
                this.logger.error(err as Error)

                throw err
            })

            await this.writeToLocalStorage(options.filePath, response).catch(err => {
                this.logger.error(err as Error)

                throw err
            })

            // save the url of the downloaded and cached assets
            options.globalStorage.update(options.lastDownloadedURLKey, options.currentURL)
        }
    }

    protected async writeToLocalStorage(destinationPath: string, data: string): Promise<void> {
        const storageFolder = this.dirPath

        try {
            if (!(await this.fileExists(storageFolder))) {
                this.logger.debug('Folder for graphing script and styling doesnt exist. Creating it.')

                await this.makeDir(storageFolder)
            }

            await this.writeFile(destinationPath, data, 'utf8')
        } catch (err) {
            /*
             * Was able to download the required files,
             * but there was an error trying to write them to this extensions globalStorage location.
             */
            this.logger.error(err as Error)

            throw err
        }
    }
}

async function httpsGetRequestWrapper(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        request.get(url, function(error, response) {
            if (error) {
                reject(error)
            } else {
                resolve((response.body as any) as string)
            }
        })
    })
}
