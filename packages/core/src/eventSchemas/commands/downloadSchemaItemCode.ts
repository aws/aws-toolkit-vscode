/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import { Schemas } from 'aws-sdk'
import fs = require('fs')
import path = require('path')
import * as vscode from 'vscode'
import { SchemaClient } from '../../shared/clients/schemaClient'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../../shared/filesystemUtilities'
import * as localizedText from '../../shared/localizedText'
import { getLogger, Logger } from '../../shared/logger'
import { Result } from '../../shared/telemetry/telemetry'
import { SchemaItemNode } from '../explorer/schemaItemNode'
import { getLanguageDetails } from '../models/schemaCodeLangs'

import {
    DefaultSchemaCodeDownloadWizardContext,
    SchemaCodeDownloadWizard,
    SchemaCodeDownloadWizardResponse,
} from '../wizards/schemaCodeDownloadWizard'

import admZip from 'adm-zip'
import globals from '../../shared/extensionGlobals'
import { telemetry } from '../../shared/telemetry/telemetry'

enum CodeGenerationStatus {
    CREATE_COMPLETE = 'CREATE_COMPLETE',
    CREATE_IN_PROGRESS = 'CREATE_IN_PROGRESS',
}

const retryintervalms = 2000
const _maxRetries = 150 // p100 of Java code generation is 250 seconds. So retry for an even 5 minutes.

export async function downloadSchemaItemCode(node: SchemaItemNode, outputChannel: vscode.OutputChannel) {
    const logger: Logger = getLogger()
    let downloadResult: Result = 'Succeeded'

    try {
        const wizardContext = new DefaultSchemaCodeDownloadWizardContext(node)
        const wizardResponse: SchemaCodeDownloadWizardResponse | undefined = await new SchemaCodeDownloadWizard(
            wizardContext
        ).run()
        if (!wizardResponse) {
            return
        }

        void vscode.window.showInformationMessage(
            localize(
                'AWS.message.info.schemas.downloadCodeBindings.start',
                'Downloading code for schema {0}...',
                node.schemaName
            )
        )

        const coreFileName = getCoreFileName(node.schemaName, getLanguageDetails(wizardResponse.language).extension)
        const request: SchemaCodeDownloadRequestDetails = {
            registryName: node.registryName,
            schemaName: node.schemaName,
            language: getLanguageDetails(wizardResponse.language).apiValue,
            schemaVersion: wizardResponse.schemaVersion,
            destinationDirectory: wizardResponse.location,
            schemaCoreCodeFileName: coreFileName,
        }
        const schemaCodeDownloader = createSchemaCodeDownloaderObject(node.client, outputChannel)
        const coreCodeFilePath = await schemaCodeDownloader.downloadCode(request)
        void vscode.window.showInformationMessage(
            localize(
                'AWS.message.info.schemas.downloadCodeBindings.finished',
                'Downloaded code for schema {0}!',
                request.schemaName
            )
        )

        if (coreCodeFilePath) {
            await vscode.window.showTextDocument(vscode.Uri.file(coreCodeFilePath))
        }
    } catch (err) {
        downloadResult = 'Failed'
        const error = err as Error
        let errorMessage = localize(
            'AWS.message.error.schemas.downloadCodeBindings.failed_to_download',
            'Unable to download schema code'
        )

        if (error instanceof UserNotifiedError && error.message) {
            errorMessage = error.message
        }
        void vscode.window.showErrorMessage(errorMessage)
        logger.error('Error downloading schema: %s', error)
    } finally {
        telemetry.schemas_download.emit({ result: downloadResult })
    }
}

function getCoreFileName(schemaName: string, fileExtension: string) {
    const parsedName = schemaName.split('@')

    return parsedName[parsedName.length - 1].concat(fileExtension)
}

export function createSchemaCodeDownloaderObject(
    client: SchemaClient,
    outputChannel: vscode.OutputChannel
): SchemaCodeDownloader {
    const downloader = new CodeDownloader(client)
    const generator = new CodeGenerator(client)
    const poller = new CodeGenerationStatusPoller(client)
    const extractor = new CodeExtractor(outputChannel)

    return new SchemaCodeDownloader(downloader, generator, poller, extractor)
}

export interface SchemaCodeDownloadRequestDetails {
    registryName: string
    schemaName: string
    language: string
    schemaVersion: string
    destinationDirectory: vscode.Uri
    schemaCoreCodeFileName?: string
}

export class SchemaCodeDownloader {
    public constructor(
        private readonly downloader: CodeDownloader,
        private readonly generator: CodeGenerator,
        private readonly poller: CodeGenerationStatusPoller,
        private readonly extractor: CodeExtractor
    ) {}

    public async downloadCode(request: SchemaCodeDownloadRequestDetails): Promise<string | void> {
        let zipContents: ArrayBuffer
        try {
            // If the code bindings for a given schema previously generated, this would succeed
            zipContents = await this.downloader.download(request)
        } catch (err) {
            const error = err as Error
            if (error.name === 'ResourceNotFound') {
                // If the code generation wasn't previously kicked off, do so
                void vscode.window.showInformationMessage(
                    localize(
                        'AWS.message.info.schemas.downloadCodeBindings.generate',
                        '{0}: Generating code (this may take a few seconds the first time)...',
                        request.schemaName
                    )
                )
                await this.generator.generate(request)

                // Then, poll for completion
                await this.poller.pollForCompletion(request)

                // Download generated code bindings
                void vscode.window.showInformationMessage(
                    localize(
                        'AWS.message.info.schemas.downloadCodeBindings.downloading',
                        '{0}: Downloading code...',
                        request.schemaName
                    )
                )
                zipContents = await this.downloader.download(request)
            } else {
                throw err // Unexpected exception, throw
            }
        }
        void vscode.window.showInformationMessage(
            localize(
                'AWS.message.info.schemas.downloadCodeBindings.extracting',
                '{0}: Extracting/copying code...',
                request.schemaName
            )
        )

        return await this.extractor.extractAndPlace(zipContents, request)
    }
}

export class CodeGenerator {
    public constructor(public client: SchemaClient) {}

    public async generate(
        codeDownloadRequest: SchemaCodeDownloadRequestDetails
    ): Promise<Schemas.PutCodeBindingResponse> {
        let response: Schemas.PutCodeBindingResponse
        try {
            response = await this.client.putCodeBinding(
                codeDownloadRequest.language,
                codeDownloadRequest.registryName,
                codeDownloadRequest.schemaName,
                codeDownloadRequest.schemaVersion
            )
        } catch (err) {
            const error = err as Error
            if (error.stack && error.stack!.includes('ConflictException')) {
                response = {
                    Status: CodeGenerationStatus.CREATE_IN_PROGRESS,
                }
            } else {
                getLogger().error(error)
                throw new UserNotifiedError(
                    localize(
                        'AWS.message.error.schemas.downloadCodeBindings.failed_to_generate',
                        'Unable to generate schema code'
                    )
                )
            }
        }

        return response
    }
}

export class CodeGenerationStatusPoller {
    public constructor(public client: SchemaClient) {}

    public async pollForCompletion(
        codeDownloadRequest: SchemaCodeDownloadRequestDetails,
        retryInterval: number = retryintervalms,
        maxRetries: number = _maxRetries
    ): Promise<string> {
        for (let i = 0; i < maxRetries; i++) {
            const codeGenerationStatus = await this.getCurrentStatus(codeDownloadRequest)

            if (codeGenerationStatus === CodeGenerationStatus.CREATE_COMPLETE) {
                return codeGenerationStatus
            }
            if (codeGenerationStatus !== CodeGenerationStatus.CREATE_IN_PROGRESS) {
                throw new UserNotifiedError(
                    localize(
                        'AWS.message.error.schemas.downloadCodeBindings.invalid_code_generation_status',
                        'Invalid Code generation status {0}',
                        codeGenerationStatus
                    )
                )
            }

            await new Promise<void>((resolve) => globals.clock.setTimeout(resolve, retryInterval))
        }
        throw new UserNotifiedError(
            localize(
                'AWS.message.error.schemas.downloadCodeBindings.timeout',
                'Failed to download code for schema {0} before timeout. Please try again later',
                codeDownloadRequest.schemaName
            )
        )
    }

    public async getCurrentStatus(codeDownloadRequest: SchemaCodeDownloadRequestDetails): Promise<string | undefined> {
        const response = await this.client.describeCodeBinding(
            codeDownloadRequest.language,
            codeDownloadRequest.registryName,
            codeDownloadRequest.schemaName,
            codeDownloadRequest.schemaVersion
        )

        return response.Status
    }
}
export class CodeDownloader {
    public constructor(public client: SchemaClient) {}

    public async download(codeDownloadRequest: SchemaCodeDownloadRequestDetails): Promise<ArrayBuffer> {
        const response = await this.client.getCodeBindingSource(
            codeDownloadRequest.language,
            codeDownloadRequest.registryName,
            codeDownloadRequest.schemaName,
            codeDownloadRequest.schemaVersion
        )

        if (Buffer.isBuffer(response.Body)) {
            const zipContents = response.Body!.buffer

            return zipContents
        } else {
            throw new TypeError('Response body should be Buffer type')
        }
    }
}

export class CodeExtractor {
    public constructor(private readonly outputChannel: vscode.OutputChannel) {}
    public async extractAndPlace(
        zipContents: ArrayBuffer,
        request: SchemaCodeDownloadRequestDetails
    ): Promise<string | void> {
        let codeZipDir: string | undefined
        try {
            const fileName = `${request.schemaName}.${request.schemaVersion}.${request.language}.zip`

            codeZipDir = await makeTemporaryToolkitFolder()

            const codeZipFile = path.join(codeZipDir, fileName)
            const destinationDirectory = request.destinationDirectory.fsPath

            // write binary data into a temp zip file in a temp directory
            const zipContentsBinary = new Uint8Array(zipContents)
            const fd = fs.openSync(codeZipFile, 'w')
            fs.writeSync(fd, zipContentsBinary, 0, zipContentsBinary.byteLength, 0)
            fs.closeSync(fd)

            let overwriteFiles: boolean = false
            const collisionExist = this.checkFileCollisions(codeZipFile, destinationDirectory)

            if (collisionExist) {
                overwriteFiles = await this.confirmOverwriteCollisions()
            }

            const zip = new admZip(codeZipFile)
            zip.extractAllTo(destinationDirectory, overwriteFiles)

            const coreCodeFilePath = this.getCoreCodeFilePath(codeZipFile, request.schemaCoreCodeFileName)

            if (coreCodeFilePath) {
                return path.join(destinationDirectory, coreCodeFilePath)
            }

            return undefined
        } finally {
            await tryRemoveFolder(codeZipDir)
        }
    }

    // Check if downloaded code hierarchy has collisions with the destination directory and display them in output channel
    public checkFileCollisions(codeZipFile: string, destinationDirectory: string): boolean {
        const zip = new admZip(codeZipFile)
        const zipEntries = zip.getEntries()
        const detectedCollisions: string[] = []

        zipEntries.forEach(function (zipEntry) {
            if (zipEntry.isDirectory) {
                // Ignore directories because those can/will merged
            } else {
                const intendedDestinationPath = path.join(destinationDirectory, '/', zipEntry.entryName)
                if (fs.existsSync(intendedDestinationPath)) {
                    detectedCollisions.push(intendedDestinationPath)
                }
            }
        })

        if (detectedCollisions.length > 0) {
            this.writeToOutputChannel(detectedCollisions)
        }

        return detectedCollisions.length > 0
    }

    public writeToOutputChannel(detectedCollisions: string[]) {
        this.outputChannel.show(true)
        this.outputChannel.appendLine(
            localize(
                'AWS.message.info.schemas.downloadCodeBindings.colliding_files',
                'Following files already exist in the folder hierarchy :'
            )
        )

        for (const filePath of detectedCollisions) {
            this.outputChannel.appendLine(filePath)
        }
    }

    public async confirmOverwriteCollisions(): Promise<boolean> {
        const userResponse = await vscode.window.showInformationMessage(
            localize(
                'AWS.message.info.schemas.downloadCodeBindings.colliding_override',
                'Downloaded code hierarchy has collisions in the destination directory. Overwrite it?'
            ),
            { modal: true },
            localizedText.yes,
            localizedText.no
        )

        if (!userResponse) {
            throw new UserNotifiedError(
                localize('AWS.message.error.schemas.downloadCodeBindings.cancelled', 'Download code bindings cancelled')
            )
        }

        return userResponse === localizedText.yes
    }

    public getCoreCodeFilePath(codeZipFile: string, coreFileName: string | undefined): string | undefined {
        if (coreFileName) {
            const zip = new admZip(codeZipFile)
            const zipEntries = zip.getEntries()

            for (const zipEntry of zipEntries) {
                if (zipEntry.isDirectory) {
                    // Ignore directories
                } else {
                    if (zipEntry.name === coreFileName) {
                        return zipEntry.entryName
                    }
                }
            }
        }

        return undefined
    }
}

class UserNotifiedError extends Error {
    public constructor(message?: string | undefined) {
        super(message)
    }
}
