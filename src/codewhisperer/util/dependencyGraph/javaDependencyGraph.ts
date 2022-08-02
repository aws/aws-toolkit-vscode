/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { existsSync, statSync, readdirSync, readlinkSync } from 'fs'
import * as vscode from 'vscode'
import { DependencyGraph, TruncPaths } from './dependencyGraph'
import { sleep } from '../../../shared/utilities/timeoutUtils'
import { readFileAsString } from '../../../shared/filesystemUtilities'
import { getLogger } from '../../../shared/logger'
import { CodeWhispererConstants } from '../../models/constants'
import path = require('path')

export const IMPORT = 'import'
export const STATIC = 'static'
export const PACKAGE = 'package'
export const SEMICOLON = ';'
export const ENCODE = 'utf8'
export const IMPORT_REGEX = /^import(\s+static\s*)?\s+([\w\.]+)\s*;/gm
export const PACKAGE_REGEX = /^package\s+([\w\.]+)\s*;/gm
export const BUILD_EXT = '.class'
export const FILE_EXT = '.java'

interface PackageNode {
    paths: string[]
    valid: boolean
}

interface JavaStatement {
    imports: string[]
    packages: string[]
}

export class JavaDependencyGraph extends DependencyGraph {
    private _outputDirs: Set<string> = new Set<string>()
    private _outputNonStrictDirs: Set<string> = new Set<string>()
    private _buildFileRelativePaths: Set<string> = new Set<string>()
    private _packageStrs: Set<string> = new Set<string>()

    getReadableSizeLimit(): string {
        return `${CodeWhispererConstants.codeScanJavaPayloadSizeLimitBytes / Math.pow(2, 20)}MB`
    }

    willReachSizeLimit(current: number, adding: number): boolean {
        return current + adding > CodeWhispererConstants.codeScanJavaPayloadSizeLimitBytes
    }

    reachSizeLimit(size: number): boolean {
        return size > CodeWhispererConstants.codeScanJavaPayloadSizeLimitBytes
    }

    private extractStatement(content: string): JavaStatement {
        return {
            imports: content.match(new RegExp(IMPORT_REGEX)) ?? [],
            packages: content.match(new RegExp(PACKAGE_REGEX)) ?? [],
        }
    }

    private generateSourceFilePath(dirPath: string, importPath: string) {
        const filePath = path.join(dirPath, importPath + FILE_EXT)
        return existsSync(filePath) ? filePath : ''
    }

    private generateSourceFilePathsOfAsterisk(dirPath: string, importPath: string) {
        if (!importPath.endsWith('*')) throw new Error('Asterisk is not found in import statement.')
        const targetDir = path.join(dirPath, importPath.substring(0, importPath.length - 1))
        const filePaths: string[] = []
        readdirSync(targetDir, { encoding: ENCODE, withFileTypes: true }).forEach(file => {
            const fileAbsPath = path.join(dirPath, file.name)
            if (existsSync(fileAbsPath) && file.isFile() && file.name.endsWith(FILE_EXT)) {
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
        const packagePos = packageStr.indexOf(PACKAGE)
        const semicolonPos = packageStr.indexOf(SEMICOLON)
        const rawPackagePath = packageStr.substring(packagePos + PACKAGE.length, semicolonPos).trim()
        this._packageStrs.add(rawPackagePath)
        let packagePath = ''
        rawPackagePath.split('.').forEach(rpp => {
            packagePath = path.join(packagePath, rpp)
        })
        return packagePath
    }

    private generateBuildFileRelativePath(uri: vscode.Uri, projectPath: string, pacakges: RegExpMatchArray) {
        const packagePath = pacakges.length > 0 ? this.generatePackagePath(pacakges[0]) : ''
        const sourceFilePath = uri.fsPath
        if (!sourceFilePath.startsWith(projectPath))
            throw new Error("Invalid source file path which doesn't contain valid workspace.")
        let buildFileRelativePath
        if (packagePath === '') {
            buildFileRelativePath = path.parse(sourceFilePath).base
        } else {
            const pos = sourceFilePath.lastIndexOf(packagePath)
            buildFileRelativePath = sourceFilePath.substring(pos)
        }
        return buildFileRelativePath.replace(path.extname(sourceFilePath), BUILD_EXT)
    }

    private getImportPath(importStr: string) {
        const importPos = importStr.indexOf(IMPORT)
        const semicolonPos = importStr.indexOf(SEMICOLON)
        let rawImportPath = importStr.substring(importPos + IMPORT.length, semicolonPos).trim()
        if (rawImportPath.startsWith(STATIC + ' ')) {
            const start = STATIC.length
            const end = rawImportPath.lastIndexOf('.')
            rawImportPath = rawImportPath.substring(start, end).trim()
        }
        return path.join(...rawImportPath.split('.'))
    }

    parseImport(importStr: string, dirPaths: string[]) {
        if (this._parsedStatements.has(importStr)) return []
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

    private async getFileLevelBuildFilePaths(uri: vscode.Uri, projectPath: string) {
        const filePath = uri.fsPath
        this._pickedSourceFiles.clear()
        this._pickedSourceFiles.add(filePath)
        this._totalSize = statSync(filePath).size
        const content = await readFileAsString(uri.fsPath)
        this._totalLines = content.split('\n').length
        const javaStatement = this.extractStatement(content)
        this._buildFileRelativePaths.clear()
        const buildFileRelativePath = this.generateBuildFileRelativePath(uri, projectPath, javaStatement.packages)
        getLogger().debug(buildFileRelativePath)
        return this.generateOneBuildFilePaths(buildFileRelativePath)
    }

    async searchDependency(uri: vscode.Uri) {
        const filePath = uri.fsPath
        const q: string[] = []
        q.push(filePath)
        while (q.length > 0) {
            let count: number = q.length
            while (count > 0) {
                if (this.reachSizeLimit(this._totalSize)) return
                count -= 1
                const currentFilePath = q.shift()
                if (currentFilePath === undefined) throw new Error('"undefined" is invalid for queued file.')
                if (!existsSync(currentFilePath)) continue
                this._pickedSourceFiles.add(currentFilePath)
                this._totalSize += statSync(currentFilePath).size
                const uri = vscode.Uri.file(currentFilePath)
                const content = await readFileAsString(uri.fsPath)
                this._totalLines += content.split('\n').length
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
    }

    async traverseDir(dirPath: string) {
        if (!existsSync(dirPath) || this.reachSizeLimit(this._totalSize) || this._fetchedDirs.has(dirPath)) return
        readdirSync(dirPath, { encoding: ENCODE, withFileTypes: true }).forEach(async file => {
            const fileAbsPath = path.join(dirPath, file.name)
            if (existsSync(fileAbsPath) && file.name.charAt(0) !== '.') {
                if (file.isDirectory()) {
                    await this.traverseDir(fileAbsPath)
                } else if (file.isFile()) {
                    if (
                        file.name.endsWith(FILE_EXT) &&
                        !this.reachSizeLimit(this._totalSize) &&
                        !this.willReachSizeLimit(this._totalSize, statSync(fileAbsPath).size) &&
                        !this._pickedSourceFiles.has(fileAbsPath)
                    ) {
                        await this.searchDependency(vscode.Uri.file(fileAbsPath))
                    }
                }
            }
        })
        this._fetchedDirs.add(dirPath)
    }

    private generateOneBuildFilePaths(buildFileRelativePath: string) {
        const oneBuildFilePaths: string[] = []
        this._outputDirs.forEach(dir => {
            const builFilePath = path.join(dir, buildFileRelativePath)
            if (existsSync(builFilePath) && oneBuildFilePaths.length == 0) {
                oneBuildFilePaths.push(builFilePath)
            }
        })
        this._outputNonStrictDirs.forEach(dir => {
            const builFilePath = path.join(dir, buildFileRelativePath)
            if (existsSync(builFilePath) && oneBuildFilePaths.length == 0) {
                oneBuildFilePaths.push(builFilePath)
            }
        })
        if (oneBuildFilePaths.length == 0) {
            throw new Error(`${buildFileRelativePath} is not found.`)
        }
        return oneBuildFilePaths
    }

    private generateBuildFilePaths() {
        const buildFiles: Set<string> = new Set<string>()
        this._buildFileRelativePaths.forEach(relativePath => {
            let findBuildFile: boolean = false
            this._outputDirs.forEach(dir => {
                const builFilePath = path.join(dir, relativePath)
                if (existsSync(builFilePath) && !findBuildFile) {
                    buildFiles.add(builFilePath)
                    findBuildFile = true
                }
            })
            this._outputNonStrictDirs.forEach(dir => {
                const builFilePath = path.join(dir, relativePath)
                if (existsSync(builFilePath) && !findBuildFile) {
                    buildFiles.add(builFilePath)
                    findBuildFile = true
                }
            })
            if (!findBuildFile) {
                throw new Error(`${relativePath} is not found.`)
            }
        })
        return Array.from(buildFiles.values())
    }

    private autoDetectClasspath(projectPath: string, projectName: string, extension: string) {
        const compileOutput = vscode.workspace.getConfiguration('aws.codeWhisperer').get('javaCompilationOutput')
        if (compileOutput && typeof compileOutput === 'string') {
            this._outputDirs.add(compileOutput)
        }
        this.detectClasspath(projectPath, projectName, projectName, extension)
        getLogger().debug(`Auto-detected strict classpaths:`)
        this._outputDirs.forEach(dir => {
            getLogger().debug(dir)
        })
        getLogger().debug(`Auto-detected non-strict classpaths:`)
        this._outputNonStrictDirs.forEach(dir => {
            getLogger().debug(dir)
        })
    }

    private detectClasspath(dirPath: string, dirName: string, projectName: string, extension: string): PackageNode {
        if (!existsSync(dirPath) || dirPath.indexOf(projectName) === -1) return { paths: [], valid: false }

        const packageNode: PackageNode = { paths: [], valid: true }
        let hasBuildFile: boolean = false

        readdirSync(dirPath, { encoding: ENCODE, withFileTypes: true }).forEach(file => {
            const fileAbsPath = path.join(dirPath, file.name)
            if (existsSync(fileAbsPath) && file.name.charAt(0) !== '.') {
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
            valid =
                valid ||
                Array.from(this._packageStrs).filter(s => s.length >= path.length && s.endsWith(path)).length > 0
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

    async generateTruncation(uri: vscode.Uri): Promise<TruncPaths> {
        try {
            const projectName = this.getProjectName(uri)
            const projectPath = this.getProjectPath(uri)
            await this.searchDependency(uri)
            this._sysPaths.forEach(async dir => await this.traverseDir(dir))
            await sleep(1000)
            this.autoDetectClasspath(projectPath, projectName, BUILD_EXT)
            if (this._outputDirs.size === 0 && this._outputNonStrictDirs.size === 0) {
                throw new Error(`Classpath auto-detection failed.`)
            }
            let buildFiles: string[] = []
            try {
                buildFiles = this.generateBuildFilePaths()
            } catch (error) {
                getLogger().debug('Project level compile error:', error)
                buildFiles = await this.getFileLevelBuildFilePaths(uri, projectPath)
            }
            const truncDirPath = this.getTruncDirPath(uri)
            const truncSourceDirPath = this.getTruncSourceDirPath(uri)
            const truncBuildDirPath = this.getTruncBuildDirPath(uri)
            getLogger().debug(`Picked source files:`)
            this._pickedSourceFiles.forEach(sourceFilePath => {
                getLogger().debug(sourceFilePath)
                this.copyFileToTmp(vscode.Uri.file(sourceFilePath), truncSourceDirPath)
            })
            getLogger().debug(`Picked build artifacts:`)
            buildFiles.forEach(buildFilePath => {
                getLogger().debug(buildFilePath)
                this.copyFileToTmp(vscode.Uri.file(buildFilePath), truncBuildDirPath)
            })
            const totalBuildSize = this.getFilesTotalSize(Array.from(buildFiles.values()))
            const zipSourcePath = this.zipDir(
                truncSourceDirPath,
                truncSourceDirPath,
                CodeWhispererConstants.codeScanZipExt
            )
            const zipBuildPath = this.zipDir(
                truncBuildDirPath,
                truncBuildDirPath,
                CodeWhispererConstants.codeScanZipExt
            )
            const zipSourceSize = statSync(zipSourcePath).size
            const zipBuildSize = statSync(zipBuildPath).size
            getLogger().debug(`Complete Java dependency graph.`)
            getLogger().debug(`File count: ${this._pickedSourceFiles.size}`)
            getLogger().debug(`Total size: ${((this._totalSize + totalBuildSize) / 1024).toFixed(2)}kb`)
            getLogger().debug(`Total lines: ${this._totalLines}`)
            getLogger().debug(`Source zip file: ${zipSourcePath}`)
            getLogger().debug(`Build zip file: ${zipBuildPath}`)
            return {
                root: truncDirPath,
                src: {
                    dir: truncSourceDirPath,
                    zip: zipSourcePath,
                    size: this._totalSize,
                    zipSize: zipSourceSize,
                },
                build: {
                    dir: truncBuildDirPath,
                    zip: zipBuildPath,
                    size: totalBuildSize,
                    zipSize: zipBuildSize,
                },
                lines: this._totalLines,
            }
        } catch (error) {
            getLogger().error('Java dependency graph error:', error)
            throw new JavaDependencyGraphError('Java context processing failed.')
        }
    }
}

export class JavaDependencyGraphError extends Error {}
