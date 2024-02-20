/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { existsSync, statSync, readdirSync } from 'fs'
import { getLogger } from '../../../shared/logger'
import * as CodeWhispererConstants from '../../models/constants'
import { readFileAsString } from '../../../shared/filesystemUtilities'
import { sleep } from '../../../shared/utilities/timeoutUtils'
import { DependencyGraphConstants, DependencyGraph, Truncation } from './dependencyGraph'
import * as path from 'path'

export const importRegex = /(require|require_relative|load|include|extend)\s+('[^']+'|"[^"]+"|\w+)(\s+as\s+(\w+))?/gm

export class RubyDependencyGraph extends DependencyGraph {
    // Payload Size for Ruby: 1MB
    getPayloadSizeLimitInBytes(): number {
        return CodeWhispererConstants.codeScanRubyPayloadSizeLimitBytes
    }
    override updateSysPaths(uri: vscode.Uri) {
        this.getDirPaths(uri).forEach(dirPath => {
            this._sysPaths.add(dirPath)
        })
    }

    private generateFilePath(modulePath: string, dirPath: string) {
        const filePath = path.join(dirPath, modulePath + DependencyGraphConstants.rubyExt)
        return existsSync(filePath) ? filePath : ''
    }

    //For Generating File Paths
    private generateFilePaths(modulePaths: string[], dirPaths: string[]) {
        return modulePaths
            .flatMap(modulePath => dirPaths.map(dirPath => this.generateFilePath(modulePath, dirPath)))
            .filter(filePath => filePath !== '')
    }

    //Generate the combinations for module paths
    private generateModulePaths(inputPath: string): string[] {
        const positionOfExt = inputPath.indexOf(DependencyGraphConstants.rubyExt) //To remove imports having .rb
        if (positionOfExt !== -1) {
            inputPath = inputPath.substring(0, positionOfExt).trim()
        }

        const inputPaths = inputPath.split('/')
        let outputPath = ''
        return inputPaths.map(pathSegment => {
            outputPath += (outputPath ? '/' : '') + pathSegment
            return path.join(...outputPath.split('/'))
        })
    }

    private getModulePath(modulePathStr: string) {
        const pos = modulePathStr.indexOf(DependencyGraphConstants.as)
        if (pos !== -1) {
            modulePathStr = modulePathStr.substring(0, pos)
        }

        return this.generateModulePaths(modulePathStr.replace(/[",'\s()]/g, '').trim())
    }

    private extractModulePaths(importStr: string) {
        let modulePaths: string[] = []
        const {
            require: requireKeyword,
            require_relative: requireRelativeKeyword,
            include: includeKeyword,
            extend: extendKeyword,
            load: loadKeyword,
        } = DependencyGraphConstants

        let keyword: string | undefined

        switch (true) {
            case importStr.startsWith(requireRelativeKeyword):
                keyword = requireRelativeKeyword
                break
            case importStr.startsWith(requireKeyword):
                keyword = requireKeyword
                break
            case importStr.startsWith(includeKeyword):
                keyword = includeKeyword
                break
            case importStr.startsWith(extendKeyword):
                keyword = extendKeyword
                break
            case importStr.startsWith(loadKeyword):
                keyword = loadKeyword
                break
            default:
                break
        }

        if (keyword !== undefined) {
            const modulePathStr = importStr.substring(keyword.length).trim().replace(/\s+/g, '')
            modulePaths = this.getModulePath(modulePathStr)
        }

        return modulePaths
    }

    override parseImport(importStr: string, dirPaths: string[]) {
        if (this._parsedStatements.has(importStr)) {
            return []
        }

        this._parsedStatements.add(importStr)
        const modulePaths = this.extractModulePaths(importStr)
        const dependencies = this.generateFilePaths(modulePaths, dirPaths)
        return dependencies
    }

    override getDependencies(uri: vscode.Uri, imports: string[]) {
        const dependencies: string[] = []
        imports.forEach(importStr => {
            this.updateSysPaths(uri)
            const importString = importStr.replace(';', '')
            const findings = this.parseImport(importString, Array.from(this._sysPaths.values()))
            const validSourceFiles = findings.filter(finding => !this._pickedSourceFiles.has(finding))
            validSourceFiles.forEach(file => {
                if (existsSync(file) && !this.willReachSizeLimit(this._totalSize, statSync(file).size)) {
                    dependencies.push(file)
                }
            })
        })
        return dependencies
    }
    private async readImports(content: string) {
        this._totalLines += content.split(DependencyGraphConstants.newlineRegex).length
        const regExp = new RegExp(importRegex)
        return content.match(regExp) ?? []
    }

    override async searchDependency(uri: vscode.Uri): Promise<Set<string>> {
        const filePath = uri.fsPath
        const q: string[] = []
        q.push(filePath)
        while (q.length > 0) {
            let count: number = q.length
            while (count > 0) {
                if (this.reachSizeLimit(this._totalSize)) {
                    return this._pickedSourceFiles
                }
                count -= 1
                const currentFilePath = q.shift()
                if (currentFilePath === undefined) {
                    throw new Error('"undefined" is invalid for queued file.')
                }
                this._pickedSourceFiles.add(currentFilePath)
                this._totalSize += statSync(currentFilePath).size
                const uri = vscode.Uri.file(currentFilePath)
                const content: string = await readFileAsString(uri.fsPath)
                const imports = await this.readImports(content)
                const dependencies = this.getDependencies(uri, imports)
                for (const dependency of dependencies) {
                    q.push(dependency)
                }
            }
        }
        return this._pickedSourceFiles
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
                    file.name.endsWith(DependencyGraphConstants.rubyExt) &&
                    !this.reachSizeLimit(this._totalSize) &&
                    !this.willReachSizeLimit(this._totalSize, statSync(absPath).size) &&
                    !this._pickedSourceFiles.has(absPath)
                ) {
                    await this.searchDependency(vscode.Uri.file(absPath))
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
                await this.searchDependency(uri)
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
}
