/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as os from 'os'
import * as YAML from 'js-yaml'
import xml2js = require('xml2js')
import * as CodeWhispererConstants from '../../models/constants'
import { existsSync, readFileSync, writeFileSync } from 'fs' // eslint-disable-line no-restricted-imports
import { BuildSystem, DB, FolderInfo, transformByQState } from '../../models/model'
import fs from '../../../shared/fs/fs'
import globals from '../../../shared/extensionGlobals'
import { ChatSessionManager } from '../../../amazonqGumby/chat/storages/chatSession'
import { AbsolutePathDetectedError } from '../../../amazonqGumby/errors'
import { getLogger } from '../../../shared/logger/logger'
import AdmZip from 'adm-zip'
import { IManifestFile } from './humanInTheLoopManager'
import { ExportResultArchiveStructure } from '../../../shared/utilities/download'
import { isFileNotFoundError } from '../../../shared/errors'

export async function getDependenciesFolderInfo(): Promise<FolderInfo> {
    const dependencyFolderName = `${CodeWhispererConstants.dependencyFolderName}${globals.clock.Date.now()}`
    const dependencyFolderPath = path.join(os.tmpdir(), dependencyFolderName)
    await fs.mkdir(dependencyFolderPath)
    return {
        name: dependencyFolderName,
        path: dependencyFolderPath,
    }
}

export async function writeAndShowBuildLogs(isLocalInstall: boolean = false) {
    const logFilePath = path.join(os.tmpdir(), 'build-logs.txt')
    writeFileSync(logFilePath, transformByQState.getBuildLog())
    const doc = await vscode.workspace.openTextDocument(logFilePath)
    const logs = transformByQState.getBuildLog().toLowerCase()
    if (logs.includes('intermediate build result') || logs.includes('maven jar failed')) {
        // only show the log if the build failed; show it in second column for intermediate builds only
        const options = isLocalInstall ? undefined : { viewColumn: vscode.ViewColumn.Two }
        await vscode.window.showTextDocument(doc, options)
    }
}

export async function createLocalBuildUploadZip(baseDir: string, exitCode: number | null, stdout: string) {
    const manifestFilePath = path.join(baseDir, 'manifest.json')
    const buildResultsManifest = {
        capability: 'CLIENT_SIDE_BUILD',
        exitCode: exitCode,
        commandLogFileName: 'build-output.log',
    }
    const formattedManifest = JSON.stringify(buildResultsManifest)
    await fs.writeFile(manifestFilePath, formattedManifest)

    const buildLogsFilePath = path.join(baseDir, 'build-output.log')
    await fs.writeFile(buildLogsFilePath, stdout)

    const zip = new AdmZip()
    zip.addLocalFile(buildLogsFilePath)
    zip.addLocalFile(manifestFilePath)

    const zipPath = `${baseDir}.zip`
    zip.writeZip(zipPath)
    getLogger().info(`CodeTransformation: created local build upload zip at ${zipPath}`)
    return zipPath
}

// extract the 'sources' directory of the upload ZIP so that we can apply the diff.patch to a copy of the source code
export async function extractOriginalProjectSources(destinationPath: string) {
    const zip = new AdmZip(transformByQState.getPayloadFilePath())
    const zipEntries = zip.getEntries()
    for (const zipEntry of zipEntries) {
        if (zipEntry.entryName.startsWith('sources')) {
            zip.extractEntryTo(zipEntry, destinationPath, true, true)
        }
    }
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

// return an error message, or undefined if YAML file is valid
export function validateCustomVersionsFile(fileContents: string) {
    const requiredKeys = ['dependencyManagement', 'identifier', 'targetVersion', 'originType']
    for (const key of requiredKeys) {
        if (!fileContents.includes(key)) {
            getLogger().info(`CodeTransformation: .YAML file is missing required key: ${key}`)
            return `Missing required key: \`${key}\``
        }
    }
    try {
        const yaml = YAML.load(fileContents) as any
        const dependencies = yaml?.dependencyManagement?.dependencies || []
        const plugins = yaml?.dependencyManagement?.plugins || []
        const dependenciesAndPlugins = dependencies.concat(plugins)

        if (dependenciesAndPlugins.length === 0) {
            getLogger().info('CodeTransformation: .YAML file must contain at least dependencies or plugins')
            return `YAML file must contain at least \`dependencies\` or \`plugins\` under \`dependencyManagement\``
        }
        for (const item of dependenciesAndPlugins) {
            const errorMessage = validateItem(item)
            if (errorMessage) {
                return errorMessage
            }
        }
        return undefined
    } catch (err: any) {
        getLogger().info(`CodeTransformation: Invalid YAML format: ${err.message}`)
        return `Invalid YAML format: ${err.message}`
    }
}

// return an error message, or undefined if item is valid
// validate each dependency and plugin: identifier should be in format groupId:artifactId and originType should be FIRST_PARTY or THIRD_PARTY
function validateItem(item: any, validOriginTypes: string[] = ['FIRST_PARTY', 'THIRD_PARTY']) {
    if (!/^[^\s:]+:[^\s:]+$/.test(item.identifier)) {
        getLogger().info(`CodeTransformation: Invalid identifier format: ${item.identifier}`)
        return `Invalid identifier format: \`${item.identifier}\`. Must be in format \`groupId:artifactId\` without spaces`
    }
    if (!validOriginTypes.includes(item.originType)) {
        getLogger().info(`CodeTransformation: Invalid originType: ${item.originType}`)
        return `Invalid originType: \`${item.originType}\`. Must be either \`FIRST_PARTY\` or \`THIRD_PARTY\``
    }
    if (!item.targetVersion.trim()) {
        getLogger().info(`CodeTransformation: Missing targetVersion in: ${item.identifier}`)
        return `Missing \`targetVersion\` in: \`${item.identifier}\``
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

export function setMaven() {
    // avoid using maven wrapper since we can run into permissions issues
    transformByQState.setMavenName('mvn')
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

/**
 * Saves a copy of the diff patch, summary, and build logs (if any) locally
 *
 * @param pathToArchiveDir path to the archive directory where the artifacts are unzipped
 * @param pathToDestinationDir destination directory (will create directories if path doesn't exist already)
 */
export async function copyArtifacts(pathToArchiveDir: string, pathToDestinationDir: string) {
    // create destination path if doesn't exist already
    // mkdir() will not raise an error if path exists
    await fs.mkdir(pathToDestinationDir)

    const diffPath = path.join(pathToArchiveDir, ExportResultArchiveStructure.PathToDiffPatch)
    const summaryPath = path.join(pathToArchiveDir, ExportResultArchiveStructure.PathToSummary)

    try {
        await fs.copy(diffPath, path.join(pathToDestinationDir, 'diff.patch'))
        // make summary directory if needed
        await fs.mkdir(path.join(pathToDestinationDir, 'summary'))
        await fs.copy(summaryPath, path.join(pathToDestinationDir, 'summary', 'summary.md'))
    } catch (error) {
        getLogger().error('Code Transformation: Error saving local copy of artifacts: %s', (error as Error).message)
    }

    const buildLogsPath = path.join(path.dirname(summaryPath), 'buildCommandOutput.log')
    try {
        await fs.copy(buildLogsPath, path.join(pathToDestinationDir, 'summary', 'buildCommandOutput.log'))
    } catch (error) {
        // build logs won't exist for SQL conversions (not an error)
        if (!isFileNotFoundError(error)) {
            getLogger().error(
                'Code Transformation: Error saving local copy of build logs: %s',
                (error as Error).message
            )
        }
    }
}
