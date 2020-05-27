/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { IAM, StepFunctions } from 'aws-sdk'
import { writeFile } from 'fs-extra'
import * as request from 'request'
import * as vscode from 'vscode'
import { StepFunctionsClient } from '../shared/clients/stepFunctionsClient'
import { ext } from '../shared/extensionGlobals'
import { mkdir } from '../shared/filesystem'
import { fileExists } from '../shared/filesystemUtilities'
import { getLogger, Logger } from '../shared/logger'
import {
    DiagnosticSeverity,
    DocumentLanguageSettings,
    getLanguageService,
    TextDocument as ASLTextDocument,
} from 'amazon-states-language-service'

const documentSettings: DocumentLanguageSettings = { comments: 'error', trailingCommas: 'error' }
const languageService = getLanguageService({})

export const VISUALIZATION_SCRIPT_URL = 'https://do0of8uwbahzz.cloudfront.net/sfn-0.1.5.js'
export const VISUALIZATION_CSS_URL = 'https://do0of8uwbahzz.cloudfront.net/graph-0.1.5.css'

export const SCRIPTS_LAST_DOWNLOADED_URL = 'SCRIPT_LAST_DOWNLOADED_URL'
export const CSS_LAST_DOWNLOADED_URL = 'CSS_LAST_DOWNLOADED_URL'

export interface UpdateCachedScriptOptions {
    globalStorage: vscode.Memento
    lastDownloadedURLKey: string
    currentURL: string
    filePath: string
}

export interface StateMachineGraphCacheOptions {
    cssFilePath?: string
    jsFilePath?: string
    dirPath?: string
    scriptUrl?: string
    cssUrl?: string
    writeFile?(path: string, data: string, encoding: string): Promise<void>
    makeDir?(path: string): Promise<void>
    getFileData?(url: string): Promise<string>
    fileExists?(path: string): Promise<boolean>
}

export class StateMachineGraphCache {
    protected makeDir: (path: string) => Promise<void>
    protected writeFile: (path: string, data: string, encoding: string) => Promise<void>
    protected getFileData: (url: string) => Promise<string>
    protected fileExists: (path: string) => Promise<boolean>
    protected logger: Logger
    protected cssFilePath: string
    protected jsFilePath: string
    protected dirPath: string

    public constructor(options: StateMachineGraphCacheOptions = {}) {
        const { makeDir, writeFile: writeFileCustom, getFileData, fileExists: fileExistsCustom } = options

        this.makeDir = makeDir ?? mkdir
        this.writeFile = writeFileCustom ?? writeFile
        this.logger = getLogger()
        this.getFileData = getFileData ?? httpsGetRequestWrapper
        this.cssFilePath = options.cssFilePath ?? ext.visualizationResourcePaths.visualizationLibraryCSS.fsPath
        this.jsFilePath = options.jsFilePath ?? ext.visualizationResourcePaths.visualizationLibraryScript.fsPath
        this.dirPath = options.dirPath ?? ext.visualizationResourcePaths.visualizationLibraryCachePath.fsPath
        this.fileExists = fileExistsCustom ?? fileExists
    }

    public async updateCache(globalStorage: vscode.Memento): Promise<void> {
        const scriptUpdate = this.updateCachedFile({
            globalStorage,
            lastDownloadedURLKey: SCRIPTS_LAST_DOWNLOADED_URL,
            currentURL: VISUALIZATION_SCRIPT_URL,
            filePath: this.jsFilePath,
        }).catch(error => {
            this.logger.error('Failed to update State Machine Graph script assets')
            this.logger.error(error as Error)

            throw error
        })

        const cssUpdate = this.updateCachedFile({
            globalStorage,
            lastDownloadedURLKey: CSS_LAST_DOWNLOADED_URL,
            currentURL: VISUALIZATION_CSS_URL,
            filePath: this.cssFilePath,
        }).catch(error => {
            this.logger.error('Failed to update State Machine Graph css assets')
            this.logger.error(error as Error)

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
            const response = await this.getFileData(options.currentURL)
            await this.writeToLocalStorage(options.filePath, response)

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
    const logger = getLogger()
    logger.verbose(`Step Functions is getting content from ${url}`)

    return new Promise((resolve, reject) => {
        request.get(url, function(error, response) {
            logger.verbose(`Step Functions finished getting content from ${url}`)
            if (error) {
                logger.verbose(`Step Functions was unable to get content from ${url}: %O`, error as Error)
                reject(error)
            } else {
                resolve(response.body as string)
            }
        })
    })
}

export async function* listStateMachines(
    client: StepFunctionsClient
): AsyncIterableIterator<StepFunctions.StateMachineListItem> {
    const status = vscode.window.setStatusBarMessage(
        localize('AWS.message.statusBar.loading.statemachines', 'Loading State Machines...')
    )

    try {
        yield* client.listStateMachines()
    } finally {
        if (!!status) {
            status.dispose()
        }
    }
}

/**
 * Checks if the given IAM Role is assumable by AWS Step Functions.
 * @param role The IAM role to check
 */
export function isStepFunctionsRole(role: IAM.Role): boolean {
    const STEP_FUNCTIONS_SEVICE_PRINCIPAL: string = 'states.amazonaws.com'
    const assumeRolePolicyDocument: string | undefined = role.AssumeRolePolicyDocument

    return !!assumeRolePolicyDocument?.includes(STEP_FUNCTIONS_SEVICE_PRINCIPAL)
}

export async function isDocumentValid(text: string, textDocument?: vscode.TextDocument): Promise<boolean> {
    if (!textDocument || !text) {
        return false
    }

    const doc = ASLTextDocument.create(textDocument.uri.path, textDocument.languageId, textDocument.version, text)
    // tslint:disable-next-line: no-inferred-empty-object-type
    const jsonDocument = languageService.parseJSONDocument(doc)
    const diagnostics = await languageService.doValidation(doc, jsonDocument, documentSettings)
    const isValid = !diagnostics.some(diagnostic => diagnostic.severity === DiagnosticSeverity.Error)

    return isValid
}
