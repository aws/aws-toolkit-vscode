/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as os from 'os'
import path from 'path'
import { FolderInfo } from '../../models/model'
import { fsCommon } from '../../../srcShared/fs'
import { createPomCopy, replacePomVersion } from './transformFileHandler'
import { IManifestFile } from '../../../amazonqFeatureDev/models'
import { getLogger } from '../../../shared/logger'

export class HumanInTheLoopManager {
    public readonly diagnosticCollection = vscode.languages.createDiagnosticCollection('hilPomFileDiagnostics')

    private readonly osTmpDir = os.tmpdir()
    private readonly localPathToXmlDependencyList = '/target/dependency-updates-aggregate-report.xml'
    private readonly pomReplacementDelimiter = '*****'
    private readonly tmpDownloadsFolderName = 'q-hil-dependency-artifacts'
    private readonly tmpDependencyListFolderName = 'q-pom-dependency-list'
    private readonly userDependencyUpdateFolderName = 'q-pom-dependency-update'
    private readonly tmpDependencyListDir = path.join(this.osTmpDir, this.tmpDependencyListFolderName)
    private readonly userDependencyUpdateDir = path.join(this.osTmpDir, this.userDependencyUpdateFolderName)
    private readonly tmpDownloadsDir = path.join(this.osTmpDir, this.tmpDownloadsFolderName)

    private tmpSessionFiles: string[] = []
    private pomFileVirtualFileReference!: vscode.Uri
    private manifestFileValues!: IManifestFile
    private newPomFileVirtualFileReference!: vscode.Uri

    public getTmpDependencyListDir = () => this.tmpDependencyListDir
    public getUserDependencyUpdateDir = () => this.userDependencyUpdateDir
    public getTmpDownloadsDir = () => this.tmpDownloadsDir
    public getPomFileVirtualFileReference = () => this.pomFileVirtualFileReference
    public getManifestFileValues = () => this.manifestFileValues
    public getNewPomFileVirtualFileReference = () => this.newPomFileVirtualFileReference

    public setPomFileVirtualFileReference = (file: vscode.Uri) => (this.pomFileVirtualFileReference = file)
    public setManifestFileValues = (manifestFileValues: IManifestFile) => (this.manifestFileValues = manifestFileValues)
    public setNewPomFileVirtualFileReference = (file: vscode.Uri) => (this.newPomFileVirtualFileReference = file)

    public getUploadFolderInfo = (): FolderInfo => {
        return {
            name: this.userDependencyUpdateFolderName,
            path: this.userDependencyUpdateDir,
        }
    }

    public getCompileDependencyListFolderInfo = (): FolderInfo => {
        return {
            name: this.tmpDependencyListFolderName,
            path: this.tmpDependencyListDir,
        }
    }

    public getDependencyListXmlOutput = async () =>
        await fsCommon.readFileAsString(path.join(this.tmpDependencyListDir, this.localPathToXmlDependencyList))

    public createPomFileCopy = async (outputDirectoryPath: string, pomFileVirtualFileReference: vscode.Uri) => {
        const newPomCopyRef = await createPomCopy(outputDirectoryPath, pomFileVirtualFileReference, 'pom.xml')
        this.tmpSessionFiles.push(newPomCopyRef.path)
        return newPomCopyRef
    }

    public replacePomFileVersion = async (pomFileVirtualFileReference: vscode.Uri, version: string) =>
        await replacePomVersion(pomFileVirtualFileReference, version, this.pomReplacementDelimiter)

    public cleanUpArtifacts = async () => {
        const artifactCleanUpErrorMessage = (e: any) =>
            `CodeTransformation: Error cleaning up artifacts = ${e?.message}`
        try {
            await fsCommon.delete(this.userDependencyUpdateDir)
        } catch (e: any) {
            getLogger().error(artifactCleanUpErrorMessage(e))
        }
        try {
            await fsCommon.delete(this.tmpDependencyListDir)
        } catch (e: any) {
            getLogger().error(artifactCleanUpErrorMessage(e))
        }
        try {
            await fsCommon.delete(this.tmpDownloadsDir)
        } catch (e: any) {
            getLogger().error(artifactCleanUpErrorMessage(e))
        }
        for (let i = 0; i < this.tmpSessionFiles.length; i++) {
            try {
                await fsCommon.delete(this.tmpSessionFiles[i])
            } catch (e: any) {
                getLogger().error(artifactCleanUpErrorMessage(e))
            }
        }
        this.tmpSessionFiles = []
    }

    static #instance: HumanInTheLoopManager | undefined

    public static get instance() {
        return (this.#instance ??= new this())
    }
}
