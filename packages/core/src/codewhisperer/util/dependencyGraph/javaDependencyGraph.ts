/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { existsSync, statSync, readdirSync, readlinkSync } from 'fs'
import * as vscode from 'vscode'
import { DependencyGraphConstants, DependencyGraph, Truncation } from './dependencyGraph'
import { sleep } from '../../../shared/utilities/timeoutUtils'
import { readFileAsString } from '../../../shared/filesystemUtilities'
import { getLogger } from '../../../shared/logger'
import * as CodeWhispererConstants from '../../models/constants'
import path = require('path')
import { CodeWhispererSettings } from '../codewhispererSettings'

export interface PackageNode {
    paths: string[]
    valid: boolean
}

export interface JavaStatement {
    imports: string[]
    packages: string[]
}

export const importRegex = /^import(\s+static\s*)?\s+([\w\.]+)\s*;/gm
export const packageRegex = /^package\s+([\w\.]+)\s*;/gm

export class JavaDependencyGraph extends DependencyGraph {
    private _outputDirs: Set<string> = new Set<string>()
    private _outputNonStrictDirs: Set<string> = new Set<string>()
    private _buildFileRelativePaths: Set<string> = new Set<string>()
    private _packageStrs: Set<string> = new Set<string>()

    getPayloadSizeLimitInBytes(): number {
        return CodeWhispererConstants.codeScanJavaPayloadSizeLimitBytes
    }

    private extractStatement(content: string): JavaStatement {
        return {
            imports: content.match(new RegExp(importRegex)) ?? [],
            packages: content.match(new RegExp(packageRegex)) ?? [],
        }
    }

    private generateSourceFilePath(dirPath: string, importPath: string) {
        const filePath = path.join(dirPath, importPath + DependencyGraphConstants.javaExt)
        return existsSync(filePath) ? filePath : ''
    }

    private generateSourceFilePathsOfAsterisk(dirPath: string, importPath: string) {
        if (!importPath.endsWith('*')) {
            throw new Error('Asterisk is not found in import statement.')
        }
        const targetDir = path.join(dirPath, importPath.substring(0, importPath.length - 1))
        const filePaths: string[] = []
        readdirSync(targetDir, { withFileTypes: true }).forEach(file => {
            const fileAbsPath = path.join(dirPath, file.name)
            if (existsSync(fileAbsPath) && file.isFile() && file.name.endsWith(DependencyGraphConstants.javaExt)) {
                filePaths.push(fileAbsPath)
            }
        })
        return filePaths
    }

    private generateSourceFilePaths(dirPaths: string[], importPath: string) {
        const paths: string[] = []
        dirPaths.forEach(dirPath => {
            if (importPath.endsWith('*')) {
                const filePaths = this.generateSourceFilePathsOfAsterisk(dirPath, importPath)
                filePaths.forEach(path => {
                    paths.push(path)
                })
            } else {
                const filePath = this.generateSourceFilePath(dirPath, importPath)
                if (filePath !== '') {
                    paths.push(filePath)
                }
            }
        })
        return paths
    }

    private generatePackagePath(packageStr: string) {
        const packagePos = packageStr.indexOf(DependencyGraphConstants.package)
        const semicolonPos = packageStr.indexOf(DependencyGraphConstants.semicolon)
        const rawPackagePath = packageStr
            .substring(packagePos + DependencyGraphConstants.package.length, semicolonPos)
            .trim()
        this._packageStrs.add(rawPackagePath)
        let packagePath = ''
        rawPackagePath.split('.').forEach(rpp => {
            packagePath = path.join(packagePath, rpp)
        })
        return packagePath
    }

    private generateBuildFileRelativePath(uri: vscode.Uri, projectPath: string, pacakges: string[]) {
        const packagePath = pacakges.length > 0 ? this.generatePackagePath(pacakges[0]) : ''
        const sourceFilePath = uri.fsPath
        if (!sourceFilePath.startsWith(projectPath)) {
            throw new Error("Invalid source file path which doesn't contain valid workspace.")
        }
        let buildFileRelativePath
        if (packagePath === '') {
            buildFileRelativePath = path.parse(sourceFilePath).base
        } else {
            const pos = sourceFilePath.lastIndexOf(packagePath)
            buildFileRelativePath = sourceFilePath.substring(pos)
        }
        return buildFileRelativePath.replace(path.extname(sourceFilePath), DependencyGraphConstants.javaBuildExt)
    }

    private getImportPath(importStr: string) {
        const importPos = importStr.indexOf(DependencyGraphConstants.import)
        const semicolonPos = importStr.indexOf(DependencyGraphConstants.semicolon)
        let rawImportPath = importStr.substring(importPos + DependencyGraphConstants.import.length, semicolonPos).trim()
        if (rawImportPath.startsWith(DependencyGraphConstants.static + ' ')) {
            const start = DependencyGraphConstants.static.length
            const end = rawImportPath.lastIndexOf('.')
            rawImportPath = rawImportPath.substring(start, end).trim()
        }
        return path.join(...rawImportPath.split('.'))
    }

    parseImport(importStr: string, dirPaths: string[]) {
        if (this._parsedStatements.has(importStr)) {
            return []
        }
        this._parsedStatements.add(importStr)
        const importPath = this.getImportPath(importStr)
        const dependencies = this.generateSourceFilePaths(dirPaths, importPath)
        return dependencies
    }

    getDependencies(uri: vscode.Uri, imports: string[]) {
        const dependencies: string[] = []
        imports.forEach(importStr => {
            this.updateSysPaths(uri)
            const findings = this.parseImport(importStr, Array.from(this._sysPaths.values()))
            const validSourceFiles = findings.filter(finding => !this._pickedSourceFiles.has(finding))
            validSourceFiles.forEach(file => {
                if (existsSync(file) && !this.willReachSizeLimit(this._totalSize, statSync(file).size)) {
                    dependencies.push(file)
                }
            })
        })
        return dependencies
    }

    updateSysPaths(uri: vscode.Uri) {
        this.getDirPaths(uri).forEach(dirPath => {
            this._sysPaths.add(dirPath)
        })
    }

    async searchDependency(uri: vscode.Uri): Promise<Set<string>> {
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
                if (!existsSync(currentFilePath)) {
                    continue
                }
                this._pickedSourceFiles.add(currentFilePath)
                this._totalSize += statSync(currentFilePath).size
                const uri = vscode.Uri.file(currentFilePath)
                const content = await readFileAsString(uri.fsPath)
                this._totalLines += content.split(DependencyGraphConstants.newlineRegex).length
                const javaStatement = this.extractStatement(content)
                const buildFileRelativePath = this.generateBuildFileRelativePath(
                    uri,
                    this.getProjectPath(uri),
                    javaStatement.packages
                )
                this._buildFileRelativePaths.add(buildFileRelativePath)
                const dependencies = this.getDependencies(uri, javaStatement.imports)
                dependencies.forEach(dependency => {
                    q.push(dependency)
                })
            }
        }
        return this._pickedSourceFiles
    }

    async traverseDir(dirPath: string) {
        if (!existsSync(dirPath) || this.reachSizeLimit(this._totalSize) || this._fetchedDirs.has(dirPath)) {
            return
        }
        readdirSync(dirPath, { withFileTypes: true }).forEach(async file => {
            const fileAbsPath = path.join(dirPath, file.name)
            if (file.name.charAt(0) === '.' || !existsSync(fileAbsPath)) {
                return
            }
            if (file.isDirectory()) {
                await this.traverseDir(fileAbsPath)
            } else if (file.isFile()) {
                if (
                    file.name.endsWith(DependencyGraphConstants.javaExt) &&
                    !this.reachSizeLimit(this._totalSize) &&
                    !this.willReachSizeLimit(this._totalSize, statSync(fileAbsPath).size) &&
                    !this._pickedSourceFiles.has(fileAbsPath)
                ) {
                    await this.searchDependency(vscode.Uri.file(fileAbsPath))
                }
            }
        })
        this._fetchedDirs.add(dirPath)
    }

    private generateBuildFilePaths() {
        const buildFiles: Set<string> = new Set<string>()
        this._buildFileRelativePaths.forEach(relativePath => {
            let foundBuildFile: boolean = false
            this._outputDirs.forEach(dir => {
                const builFilePath = path.join(dir, relativePath)
                if (existsSync(builFilePath) && !foundBuildFile) {
                    buildFiles.add(builFilePath)
                    foundBuildFile = true
                }
            })
            if (!foundBuildFile) {
                this._outputNonStrictDirs.forEach(dir => {
                    const builFilePath = path.join(dir, relativePath)
                    if (existsSync(builFilePath) && !foundBuildFile) {
                        buildFiles.add(builFilePath)
                        foundBuildFile = true
                    }
                })
            }
            if (!foundBuildFile) {
                getLogger().verbose(`${relativePath} is not found.`)
            }
        })
        return Array.from(buildFiles.values())
    }

    private autoDetectClasspath(projectPath: string, projectName: string, extension: string) {
        const compileOutput = CodeWhispererSettings.instance.get('javaCompilationOutput', '')
        if (compileOutput) {
            this._outputDirs.add(compileOutput)
        }
        this.detectClasspath(projectPath, projectName, projectName, extension)
    }

    private detectClasspath(dirPath: string, dirName: string, projectName: string, extension: string): PackageNode {
        if (!existsSync(dirPath) || dirPath.includes(projectName)) {
            return { paths: [], valid: false }
        }

        const packageNode: PackageNode = { paths: [], valid: true }
        let hasBuildFile: boolean = false

        readdirSync(dirPath, { withFileTypes: true }).forEach(file => {
            const fileAbsPath = path.join(dirPath, file.name)
            if (file.name.charAt(0) === '.' || !existsSync(fileAbsPath)) {
                return
            }
            if (file.isDirectory()) {
                const childPackageNode = this.detectClasspath(fileAbsPath, file.name, projectName, extension)
                childPackageNode.paths.forEach(path => {
                    packageNode.paths.push(path)
                })
                packageNode.valid = packageNode.valid && childPackageNode.valid
            } else if (file.isSymbolicLink()) {
                const linkPath = readlinkSync(fileAbsPath)
                if (existsSync(linkPath) && statSync(linkPath).isDirectory()) {
                    const childPackageNode = this.detectClasspath(fileAbsPath, file.name, projectName, extension)
                    childPackageNode.paths.forEach(path => {
                        packageNode.paths.push(path)
                    })
                    packageNode.valid = packageNode.valid && childPackageNode.valid
                }
            } else if (file.isFile()) {
                hasBuildFile = hasBuildFile || file.name.endsWith(extension)
            }

            if (!packageNode.valid) {
                return { paths: [], valid: false }
            }
        })

        if (this.isValidStrictClasspath(packageNode)) {
            this._outputDirs.add(dirPath)
        } else if (this.isValidNonStrictClasspath(packageNode)) {
            this._outputNonStrictDirs.add(dirPath)
        }

        if (packageNode.paths.length === 0 && !hasBuildFile) {
            return { paths: [], valid: false }
        }

        packageNode.paths = packageNode.paths.map(path => `${dirName}.${path}`)
        packageNode.paths.push(dirName)
        packageNode.valid = this.isValidSubClasspath(packageNode)
        return packageNode
    }

    private isValidSubClasspath(node: PackageNode) {
        let valid = false
        node.paths.forEach(path => {
            valid = valid || Array.from(this._packageStrs).some(s => s.length >= path.length && s.endsWith(path))
        })
        return valid
    }

    private isValidNonStrictClasspath(node: PackageNode) {
        let valid = false
        Array.from(this._packageStrs).forEach(packageStr => {
            valid = valid || node.paths.includes(packageStr)
        })
        return valid
    }

    private isValidStrictClasspath(node: PackageNode) {
        let valid = true
        Array.from(this._packageStrs).forEach(packageStr => {
            valid = valid && node.paths.includes(packageStr)
        })
        return valid
    }

    async generateTruncation(uri: vscode.Uri): Promise<Truncation> {
        try {
            const projectName = this.getProjectName(uri)
            const projectPath = this.getProjectPath(uri)
            await this.searchDependency(uri)
            this._sysPaths.forEach(async dir => await this.traverseDir(dir))
            await sleep(1000)
            this.autoDetectClasspath(projectPath, projectName, DependencyGraphConstants.javaBuildExt)
            if (this._outputDirs.size === 0 && this._outputNonStrictDirs.size === 0) {
                getLogger().debug(`Classpath auto-detection failed.`)
            }
            const buildFiles: string[] = this.generateBuildFilePaths()
            const truncDirPath = this.getTruncDirPath(uri)
            getLogger().debug(`Picked source files: [${[...this._pickedSourceFiles].join(', ')}]`)
            await this.copyFilesToTmpDir(this._pickedSourceFiles, truncDirPath)
            getLogger().debug(`Picked build artifacts: [${buildFiles}]`)
            await this.copyFilesToTmpDir(buildFiles, truncDirPath)
            const totalBuildSize = await this.getFilesTotalSize(Array.from(buildFiles.values()))
            const zipFilePath = this.zipDir(truncDirPath, CodeWhispererConstants.codeScanZipExt)
            const zipFileSize = statSync(zipFilePath).size
            return {
                rootDir: truncDirPath,
                zipFilePath: zipFilePath,
                srcPayloadSizeInBytes: this._totalSize,
                scannedFiles: new Set(this._pickedSourceFiles),
                zipFileSizeInBytes: zipFileSize,
                buildPayloadSizeInBytes: totalBuildSize,
                lines: this._totalLines,
            }
        } catch (error) {
            getLogger().error(`${this._languageId} dependency graph error caused by:`, error)
            throw new JavaDependencyGraphError(`${this._languageId} context processing failed.`)
        }
    }

    async isTestFile(content: string) {
        const imports = await this.readImports(content)
        const filteredImport = imports.filter(importStr => {
            return (
                importStr.includes('org.junit') ||
                importStr.includes('org.mockito') ||
                importStr.includes('org.testng') ||
                importStr.includes('org.hamcrest')
            )
        })
        return filteredImport.length > 0
    }

    async getSourceDependencies(uri: vscode.Uri, content: string) {
        const imports = await this.readImports(content)
        const dependencies = this.getDependencies(uri, imports)
        return dependencies
    }

    /* New function added to fetch package path for a given file. 
    /* It is used for fetching cross-file context. 
    */
    async getSamePackageFiles(uri: vscode.Uri, projectPath: string): Promise<string[]> {
        const fileList: string[] = []
        const packagePath = path.dirname(uri.fsPath)
        readdirSync(packagePath, { withFileTypes: true }).forEach(file => {
            // TODO: Add filters to avoid . files and non .java files
            fileList.push(path.join(packagePath, file.name))
        })
        return fileList
    }

    private async readImports(content: string) {
        this._totalLines += content.split(DependencyGraphConstants.newlineRegex).length
        const regExp = new RegExp(importRegex)
        return content.match(regExp) ?? []
    }
}

export class JavaDependencyGraphError extends Error {}
