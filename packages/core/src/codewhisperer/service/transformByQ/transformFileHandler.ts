/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as os from 'os'
import xml2js = require('xml2js')
import * as CodeWhispererConstants from '../../models/constants'
import { existsSync, readFileSync, writeFileSync } from 'fs' // eslint-disable-line no-restricted-imports
import { BuildSystem, DB, FolderInfo, transformByQState } from '../../models/model'
import { IManifestFile } from '../../../amazonqFeatureDev/models'
import fs from '../../../shared/fs/fs'
import globals from '../../../shared/extensionGlobals'
import { ChatSessionManager } from '../../../amazonqGumby/chat/storages/chatSession'
import { AbsolutePathDetectedError } from '../../../amazonqGumby/errors'
import { getLogger } from '../../../shared/logger/logger'
import { isWin } from '../../../shared/vscode/env'

export function getDependenciesFolderInfo(): FolderInfo {
    const dependencyFolderName = `${CodeWhispererConstants.dependencyFolderName}${globals.clock.Date.now()}`
    const dependencyFolderPath = path.join(os.tmpdir(), dependencyFolderName)
    return {
        name: dependencyFolderName,
        path: dependencyFolderPath,
    }
}

export async function writeLogs() {
    const logFilePath = path.join(os.tmpdir(), 'build-logs.txt')
    writeFileSync(logFilePath, transformByQState.getErrorLog())
    return logFilePath
}

export async function checkBuildSystem(projectPath: string) {
    const mavenBuildFilePath = path.join(projectPath, 'pom.xml')
    if (existsSync(mavenBuildFilePath)) {
        return BuildSystem.Maven
    }
    return BuildSystem.Unknown
}

export async function parseBuildFile() {
    try {
        const absolutePaths = ['users/', 'system/', 'volumes/', 'c:\\', 'd:\\']
        const alias = path.basename(os.homedir())
        absolutePaths.push(alias)
        const buildFilePath = path.join(transformByQState.getProjectPath(), 'pom.xml')
        if (existsSync(buildFilePath)) {
            const buildFileContents = readFileSync(buildFilePath).toString().toLowerCase()
            const detectedPaths = []
            for (const absolutePath of absolutePaths) {
                if (buildFileContents.includes(absolutePath)) {
                    detectedPaths.push(absolutePath)
                }
            }
            if (detectedPaths.length > 0) {
                const warningMessage = CodeWhispererConstants.absolutePathDetectedMessage(
                    detectedPaths.length,
                    path.basename(buildFilePath),
                    detectedPaths.join(', ')
                )
                transformByQState.getChatControllers()?.errorThrown.fire({
                    error: new AbsolutePathDetectedError(warningMessage),
                    tabID: ChatSessionManager.Instance.getSession().tabID,
                })
                getLogger().info('CodeTransformation: absolute path potentially in build file')
                return warningMessage
            }
        }
    } catch (err: any) {
        // swallow error
        getLogger().error(`CodeTransformation: error scanning for absolute paths, tranformation continuing: ${err}`)
    }
    return undefined
}

export async function validateSQLMetadataFile(fileContents: string, message: any) {
    try {
        const sctData = await xml2js.parseStringPromise(fileContents)
        const dbEntities = sctData['tree']['instances'][0]['ProjectModel'][0]['entities'][0]
        const sourceDB = dbEntities['sources'][0]['DbServer'][0]['$']['vendor'].trim().toUpperCase()
        const targetDB = dbEntities['targets'][0]['DbServer'][0]['$']['vendor'].trim().toUpperCase()
        const sourceServerName = dbEntities['sources'][0]['DbServer'][0]['$']['name'].trim()
        transformByQState.setSourceServerName(sourceServerName)
        if (sourceDB !== DB.ORACLE) {
            transformByQState.getChatMessenger()?.sendUnrecoverableErrorResponse('unsupported-source-db', message.tabID)
            return false
        } else if (targetDB !== DB.AURORA_POSTGRESQL && targetDB !== DB.RDS_POSTGRESQL) {
            transformByQState.getChatMessenger()?.sendUnrecoverableErrorResponse('unsupported-target-db', message.tabID)
            return false
        }
        transformByQState.setSourceDB(sourceDB)
        transformByQState.setTargetDB(targetDB)

        const serverNodeLocations =
            sctData['tree']['instances'][0]['ProjectModel'][0]['relations'][0]['server-node-location']
        const schemaNames = new Set<string>()
        // eslint-disable-next-line unicorn/no-array-for-each
        serverNodeLocations.forEach((serverNodeLocation: any) => {
            const schemaNodes = serverNodeLocation['FullNameNodeInfoList'][0]['nameParts'][0][
                'FullNameNodeInfo'
            ].filter((node: any) => node['$']['typeNode'].toLowerCase() === 'schema')
            // eslint-disable-next-line unicorn/no-array-for-each
            schemaNodes.forEach((node: any) => {
                schemaNames.add(node['$']['nameNode'].toUpperCase())
            })
        })
        transformByQState.setSchemaOptions(schemaNames) // user will choose one of these
        getLogger().info(
            `CodeTransformation: Parsed .sct file with source DB: ${sourceDB}, target DB: ${targetDB}, source host name: ${sourceServerName}, and schema names: ${Array.from(schemaNames)}`
        )
    } catch (err: any) {
        getLogger().error('CodeTransformation: Error parsing .sct file. %O', err)
        transformByQState.getChatMessenger()?.sendUnrecoverableErrorResponse('error-parsing-sct-file', message.tabID)
        return false
    }
    return true
}

export async function setMaven() {
    let mavenWrapperExecutableName = isWin() ? 'mvnw.cmd' : 'mvnw'
    const mavenWrapperExecutablePath = path.join(transformByQState.getProjectPath(), mavenWrapperExecutableName)
    if (existsSync(mavenWrapperExecutablePath)) {
        if (mavenWrapperExecutableName === 'mvnw') {
            mavenWrapperExecutableName = './mvnw' // add the './' for non-Windows
        } else if (mavenWrapperExecutableName === 'mvnw.cmd') {
            mavenWrapperExecutableName = '.\\mvnw.cmd' // add the '.\' for Windows
        }
        transformByQState.setMavenName(mavenWrapperExecutableName)
    } else {
        transformByQState.setMavenName('mvn')
    }
    getLogger().info(`CodeTransformation: using Maven ${transformByQState.getMavenName()}`)
}

export async function openBuildLogFile() {
    const logFilePath = transformByQState.getPreBuildLogFilePath()
    const doc = await vscode.workspace.openTextDocument(logFilePath)
    await vscode.window.showTextDocument(doc)
}

export async function createPomCopy(
    dirname: string,
    pomFileVirtualFileReference: vscode.Uri,
    fileName: string
): Promise<vscode.Uri> {
    const newFilePath = path.join(dirname, fileName)
    const pomFileContents = await fs.readFileText(pomFileVirtualFileReference.fsPath)
    const directoryExits = await fs.exists(dirname)
    if (!directoryExits) {
        await fs.mkdir(dirname)
    }
    await fs.writeFile(newFilePath, pomFileContents)
    return vscode.Uri.file(newFilePath)
}

export async function replacePomVersion(pomFileVirtualFileReference: vscode.Uri, version: string, delimiter: string) {
    const pomFileText = await fs.readFileText(pomFileVirtualFileReference.fsPath)
    const pomFileTextWithNewVersion = pomFileText.replace(delimiter, version)
    writeFileSync(pomFileVirtualFileReference.fsPath, pomFileTextWithNewVersion)
}

export async function getJsonValuesFromManifestFile(
    manifestFileVirtualFileReference: vscode.Uri
): Promise<IManifestFile> {
    const manifestFileContents = await fs.readFileText(manifestFileVirtualFileReference.fsPath)
    const jsonValues = JSON.parse(manifestFileContents.toString())
    return {
        hilCapability: jsonValues?.hilType,
        pomFolderName: jsonValues?.pomFolderName,
        // TODO remove this forced version
        sourcePomVersion: jsonValues?.sourcePomVersion || '1.0',
        pomArtifactId: jsonValues?.pomArtifactId,
        pomGroupId: jsonValues?.pomGroupId,
    }
}

export interface IHighlightPomIssueParams {
    pomFileVirtualFileReference: vscode.Uri
    currentVersion: string
    latestVersion: string
    latestMajorVersion: string
}

export async function highlightPomIssueInProject(
    pomFileVirtualFileReference: vscode.Uri,
    collection: vscode.DiagnosticCollection,
    currentVersion: string
) {
    const diagnostics = vscode.languages.getDiagnostics(pomFileVirtualFileReference)

    // Open the editor and set this pom to activeTextEditor
    await vscode.window.showTextDocument(pomFileVirtualFileReference, {
        preview: true,
    })

    // Find line number for "latestVersion" or set to first line in file
    const highlightLineNumberVersion = findLineNumber(
        pomFileVirtualFileReference,
        `<version>${currentVersion}</version>`
    )
    if (highlightLineNumberVersion) {
        await setHilAnnotationObjectDetails(highlightLineNumberVersion)
        await addDiagnosticOverview(collection, diagnostics, highlightLineNumberVersion)
    }
}

async function addDiagnosticOverview(
    collection: vscode.DiagnosticCollection,
    diagnostics: vscode.Diagnostic[],
    lineNumber: number = 0
) {
    // Get the diff editor
    const documentUri = vscode.window.activeTextEditor?.document?.uri
    if (documentUri) {
        collection.clear()
        diagnostics = [
            {
                code: 'Amazon Q',
                message: 'Amazon Q experienced an issue upgrading this dependency version',
                range: new vscode.Range(new vscode.Position(lineNumber, 0), new vscode.Position(lineNumber, 50)),
                severity: vscode.DiagnosticSeverity.Error,
                relatedInformation: [
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(
                            documentUri,
                            new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 50))
                        ),
                        'This dependency is not compatible with a Java 17 upgrade. Use Amazon Q chat to upgrade the version of this dependency to a Java 17 compatible version.'
                    ),
                ],
                tags: [1, 2],
            },
        ]
        collection.set(documentUri, diagnostics)
    }
}

export async function getCodeIssueSnippetFromPom(pomFileVirtualFileReference: vscode.Uri) {
    // TODO[gumby]: not great that we read this file multiple times
    const pomFileContents = await fs.readFileText(pomFileVirtualFileReference.fsPath)

    const dependencyRegEx = /<dependencies\b[^>]*>(.*?)<\/dependencies>/ms
    const match = dependencyRegEx.exec(pomFileContents)
    const snippet = match ? match[0] : ''

    // Remove white space and convert to 2 space indented code snippet
    return snippet.trim()
}

async function setHilAnnotationObjectDetails(lineNumber: number = 0) {
    // Get active diff editor
    const diffEditor = vscode.window.activeTextEditor
    const backgroundColor = new vscode.ThemeColor('editor.wordHighlightBackground')
    const highlightDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor,
        isWholeLine: true,
        overviewRulerColor: new vscode.ThemeColor('warning'),
    })

    // Set the decorations
    diffEditor?.setDecorations(highlightDecorationType, [
        {
            range: new vscode.Range(lineNumber, 0, lineNumber, 50),
        },
    ])
}

function findLineNumber(uri: vscode.Uri, searchString: string): number | undefined {
    const textDocument = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString())
    if (!textDocument) {
        return undefined
    }

    const text = textDocument.getText()
    let lineNumber = 0
    const lines = text.split('\n')

    for (const line of lines) {
        if (line.includes(searchString)) {
            return lineNumber
        }
        lineNumber++
    }

    return undefined
}

export interface IParsedXmlDependencyOutput {
    latestVersion: string
    majorVersions: string[]
    minorVersions: string[]
    status?: string
}
export async function parseVersionsListFromPomFile(xmlString: string): Promise<IParsedXmlDependencyOutput> {
    const parser = new xml2js.Parser()
    const parsedOutput = await parser.parseStringPromise(xmlString)

    const report = parsedOutput.DependencyUpdatesReport.dependencies[0].dependency[0]

    const latestVersion = report?.lastVersion?.[0]
    const majorVersions = report?.majors?.[0]?.major || []
    const minorVersions = report?.minors?.[0]?.minor || []
    const status = report.status?.[0]

    return { latestVersion, majorVersions, minorVersions, status }
}
