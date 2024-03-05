/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { existsSync, statSync, readdirSync } from 'fs'
import * as vscode from 'vscode'
import { DependencyGraphConstants, DependencyGraph, Truncation } from './dependencyGraph'
import { sleep } from '../../../shared/utilities/timeoutUtils'
import { getLogger } from '../../../shared/logger'
import { readFileAsString } from '../../../shared/filesystemUtilities'
import * as CodeWhispererConstants from '../../models/constants'
import path = require('path')

export class terraformDependencyGraph extends DependencyGraph {
    // Payload Size for Terraform TF & HCL: 200KB
    getPayloadSizeLimitInBytes(): number {
        return CodeWhispererConstants.codeScanTerraformPayloadSizeLimitBytes
    }

    override async traverseDir(dirPath: string) {
        if (this.reachSizeLimit(this._totalSize)) {
            return
        }

        readdirSync(dirPath, { withFileTypes: true }).forEach(async file => {
            const absPath = path.join(dirPath, file.name)
            if (file.name.charAt(0) === '.' || !existsSync(absPath)) {
                return
            }
            if (file.isDirectory()) {
                await this.traverseDir(absPath)
            } else if (file.isFile()) {
                if (
                    (file.name.endsWith(DependencyGraphConstants.tfExt) ||
                        file.name.endsWith(DependencyGraphConstants.hclExt)) &&
                    !this.reachSizeLimit(this._totalSize) &&
                    !this.willReachSizeLimit(this._totalSize, statSync(absPath).size) &&
                    !this._pickedSourceFiles.has(absPath)
                ) {
                    this._totalSize += statSync(vscode.Uri.file(absPath).fsPath).size
                    const content: string = await readFileAsString(vscode.Uri.file(absPath).fsPath)
                    this._totalLines += content.split(DependencyGraphConstants.newlineRegex).length
                    this._pickedSourceFiles.add(vscode.Uri.file(absPath).fsPath)
                }
            }
        })
    }

    override async generateTruncation(uri: vscode.Uri): Promise<Truncation> {
        try {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
            if (workspaceFolder === undefined) {
                this._pickedSourceFiles.add(uri.fsPath)
            } else {
                await this.traverseDir(this.getProjectPath(uri))
            }
            await sleep(1000)
            const truncDirPath = this.getTruncDirPath(uri)
            await this.copyFilesToTmpDir(this._pickedSourceFiles, truncDirPath)
            const zipFilePath = this.zipDir(truncDirPath, CodeWhispererConstants.codeScanZipExt)
            const zipFileSize = statSync(zipFilePath).size
            return {
                rootDir: truncDirPath,
                zipFilePath: zipFilePath,
                scannedFiles: new Set(this._pickedSourceFiles),
                srcPayloadSizeInBytes: this._totalSize,
                zipFileSizeInBytes: zipFileSize,
                buildPayloadSizeInBytes: 0,
                lines: this._totalLines,
            }
        } catch (error) {
            getLogger().error(`${this._languageId} dependency graph error caused by:`, error)
            throw new Error(`${this._languageId} context processing failed.`)
        }
    }

    async getSourceDependencies(uri: vscode.Uri, content: string): Promise<string[]> {
        return []
    }
    async getSamePackageFiles(uri: vscode.Uri, projectPath: string): Promise<string[]> {
        return []
    }
    async isTestFile(content: string): Promise<boolean> {
        return false
    }
    override searchDependency(uri: vscode.Uri): Promise<Set<string>> {
        throw new Error('Method not implemented.')
    }
    override parseImport(importStr: string, dirPaths: string[]): string[] {
        throw new Error('Method not implemented.')
    }
    override updateSysPaths(uri: vscode.Uri): void {
        throw new Error('Method not implemented.')
    }
    override getDependencies(uri: vscode.Uri, imports: string[]): void {
        throw new Error('Method not implemented.')
    }
}

export class TerraformDependencyGraphError extends Error {}
