/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { IAM, StepFunctions } from 'aws-sdk'
import { mkdir, writeFile } from 'fs-extra'
import * as vscode from 'vscode'
import { StepFunctionsClient } from '../shared/clients/stepFunctionsClient'
import { fileExists } from '../shared/filesystemUtilities'
import { getLogger, Logger } from '../shared/logger'
import {
    DiagnosticSeverity,
    DocumentLanguageSettings,
    getLanguageService,
    TextDocument as ASLTextDocument,
} from 'amazon-states-language-service'
import { HttpResourceFetcher } from '../shared/resourcefetcher/httpResourceFetcher'
import globals from '../shared/extensionGlobals'
import { fromExtensionManifest } from '../shared/settings'

const documentSettings: DocumentLanguageSettings = { comments: 'error', trailingCommas: 'error' }
const languageService = getLanguageService({})

const visualizationScriptUrl = 'https://d3p8cpu0nuk1gf.cloudfront.net/sfn-0.1.8.js'
const visualizationCssUrl = 'https://d3p8cpu0nuk1gf.cloudfront.net/graph-0.1.8.css'

const scriptsLastDownloadedUrl = 'SCRIPT_LAST_DOWNLOADED_URL'
const cssLastDownloadedUrl = 'CSS_LAST_DOWNLOADED_URL'

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
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const { makeDir, writeFile: writeFileCustom, getFileData, fileExists: fileExistsCustom } = options

        this.makeDir = makeDir ?? mkdir
        this.writeFile = writeFileCustom ?? writeFile
        this.logger = getLogger()
        this.getFileData = getFileData ?? httpsGetRequestWrapper
        this.cssFilePath = options.cssFilePath ?? globals.visualizationResourcePaths.visualizationLibraryCSS.fsPath
        this.jsFilePath = options.jsFilePath ?? globals.visualizationResourcePaths.visualizationLibraryScript.fsPath
        this.dirPath = options.dirPath ?? globals.visualizationResourcePaths.visualizationLibraryCachePath.fsPath
        this.fileExists = fileExistsCustom ?? fileExists
    }

    public async updateCache(globalStorage: vscode.Memento): Promise<void> {
        const scriptUpdate = this.updateCachedFile({
            globalStorage,
            lastDownloadedURLKey: scriptsLastDownloadedUrl,
            currentURL: visualizationScriptUrl,
            filePath: this.jsFilePath,
        }).catch(error => {
            this.logger.error('Failed to update State Machine Graph script assets')
            this.logger.error(error as Error)

            throw error
        })

        const cssUpdate = this.updateCachedFile({
            globalStorage,
            lastDownloadedURLKey: cssLastDownloadedUrl,
            currentURL: visualizationCssUrl,
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
            void options.globalStorage.update(options.lastDownloadedURLKey, options.currentURL)
        }
    }

    // Coordinates check for multiple cached files.
    public async confirmCacheExists(): Promise<boolean> {
        const cssExists = await this.fileExists(this.cssFilePath)
        const jsExists = await this.fileExists(this.jsFilePath)

        if (cssExists && jsExists) {
            return true
        }

        if (!cssExists) {
            // Help users setup on disconnected C9/VSCode instances.
            this.logger.error(
                `Failed to locate cached State Machine Graph css assets. Expected to find: "${visualizationCssUrl}" at "${this.cssFilePath}"`
            )
        }
        if (!jsExists) {
            // Help users setup on disconnected C9/VSCode instances.
            this.logger.error(
                `Failed to locate cached State Machine Graph js assets. Expected to find: "${visualizationScriptUrl}" at "${this.jsFilePath}"`
            )
        }
        throw new Error('Failed to located cached State Machine Graph assets')
    }

    protected async writeToLocalStorage(destinationPath: string, data: string): Promise<void> {
        const storageFolder = this.dirPath

        try {
            this.logger.debug('stepFunctions: creating directory: %O', storageFolder)
            await this.makeDir(storageFolder)
        } catch (err) {
            const error = err as Error & { code?: string }
            this.logger.verbose(error)
            // EEXIST failure is non-fatal. This function is called as part of
            // a Promise.all() group of tasks wanting to create the same directory.
            if (error.code && error.code !== 'EEXIST') {
                throw err
            }
        }

        try {
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
    logger.verbose('Step Functions is getting content...')

    const fetcher = new HttpResourceFetcher(url, { showUrl: true })
    const val = await fetcher.get()

    if (!val) {
        const message = 'Step Functions was unable to get content.'
        logger.verbose(message)
        throw new Error(message)
    }

    return val
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
        if (status) {
            status.dispose()
        }
    }
}

/**
 * Checks if the given IAM Role is assumable by AWS Step Functions.
 * @param role The IAM role to check
 */
export function isStepFunctionsRole(role: IAM.Role): boolean {
    const stepFunctionsSevicePrincipal: string = 'states.amazonaws.com'
    const assumeRolePolicyDocument: string | undefined = role.AssumeRolePolicyDocument

    return !!assumeRolePolicyDocument?.includes(stepFunctionsSevicePrincipal)
}

export async function isDocumentValid(text: string, textDocument?: vscode.TextDocument): Promise<boolean> {
    if (!textDocument || !text) {
        return false
    }

    const doc = ASLTextDocument.create(textDocument.uri.path, textDocument.languageId, textDocument.version, text)
    const jsonDocument = languageService.parseJSONDocument(doc)
    const diagnostics = await languageService.doValidation(doc, jsonDocument, documentSettings)
    const isValid = !diagnostics.some(diagnostic => diagnostic.severity === DiagnosticSeverity.Error)

    return isValid
}

const descriptor = {
    maxItemsComputed: (v: unknown) => Math.trunc(Math.max(0, Number(v))),
    ['format.enable']: Boolean,
}

export class StepFunctionsSettings extends fromExtensionManifest('aws.stepfunctions.asl', descriptor) {}
