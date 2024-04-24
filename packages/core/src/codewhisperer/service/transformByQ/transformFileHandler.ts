/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as os from 'os'
import xml2js = require('xml2js')
import * as CodeWhispererConstants from '../../models/constants'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { BuildSystem, FolderInfo, transformByQState } from '../../models/model'
import { IManifestFile } from '../../../amazonqFeatureDev/models'
import { fsCommon } from '../../../srcShared/fs'

export function getDependenciesFolderInfo(): FolderInfo {
    const dependencyFolderName = `${CodeWhispererConstants.dependencyFolderName}${Date.now()}`
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

export async function createPomCopy(
    dirname: string,
    pomFileVirtualFileReference: vscode.Uri,
    fileName: string
): Promise<vscode.Uri> {
    const newFilePath = path.join(dirname, fileName)
    const pomFileContents = await fsCommon.readFileAsString(pomFileVirtualFileReference.fsPath)
    const directoryExits = await fsCommon.exists(dirname)
    if (!directoryExits) {
        await fsCommon.mkdir(dirname)
    }
    await fsCommon.writeFile(newFilePath, pomFileContents)
    return vscode.Uri.file(newFilePath)
}

export async function replacePomVersion(pomFileVirtualFileReference: vscode.Uri, version: string, delimiter: string) {
    const pomFileText = readFileSync(pomFileVirtualFileReference.fsPath, 'utf-8')
    const pomFileTextWithNewVersion = pomFileText.replace(delimiter, version)
    writeFileSync(pomFileVirtualFileReference.fsPath, pomFileTextWithNewVersion)
}

export async function getJsonValuesFromManifestFile(
    manifestFileVirtualFileReference: vscode.Uri
): Promise<IManifestFile> {
    const manifestFileContents = readFileSync(manifestFileVirtualFileReference.fsPath, 'utf-8')
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

export async function highlightPomIssueInProject(pomFileVirtualFileReference: vscode.Uri, currentVersion: string) {
    const collection = vscode.languages.createDiagnosticCollection(pomFileVirtualFileReference.path)
    const diagnostics = vscode.languages.getDiagnostics(pomFileVirtualFileReference)

    // Open the editor and set this pom to activeTextEditor
    await vscode.window.showTextDocument(pomFileVirtualFileReference)

    // Find line number for "latestVersion" or set to first line in file
    const highlightLineNumber = findLineNumber(pomFileVirtualFileReference, '<dependency>') || 1
    await setAnnotationObjectDetails(highlightLineNumber)
    await addDiagnosticOverview(collection, diagnostics, highlightLineNumber)
}

async function addDiagnosticOverview(
    collection: vscode.DiagnosticCollection,
    diagnostics: vscode.Diagnostic[],
    lineNumber: number = 0
) {
    // Get the diff editor
    const documentUri = vscode.window.activeTextEditor?.document?.uri
    if (documentUri) {
        collection.clear() // clear the collection
        diagnostics = []
        diagnostics.push({
            code: 'code1',
            message: 'There is an issue with your pom 1p related dependency',
            range: new vscode.Range(new vscode.Position(lineNumber - 1, 0), new vscode.Position(lineNumber - 1, 50)),
            severity: vscode.DiagnosticSeverity.Error,
            source: 'This is a test diagnostic',
            relatedInformation: [
                new vscode.DiagnosticRelatedInformation(
                    new vscode.Location(
                        documentUri,
                        new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 50))
                    ),
                    'This is the first instance we found'
                ),
            ],
            tags: [1, 2],
        })

        collection.set(documentUri, diagnostics)
        // Get first diagnostic to display
        const diffEditor = vscode.window.activeTextEditor
        const diffEditorDocument = diffEditor?.document
        if (diffEditor && diffEditorDocument) {
            const firstDiagnostic = collection.get(documentUri)?.[0]
            if (firstDiagnostic) {
                // Convert diagnostic to vscode Location
                new vscode.Location(diffEditor.document.uri, firstDiagnostic.range)

                // Reveal and select first diagnostic
                diffEditor.selection = new vscode.Selection(firstDiagnostic.range.start, firstDiagnostic.range.end)
                diffEditor.revealRange(firstDiagnostic.range)
            }
        }
    }
}

export async function getCodeIssueSnippetFromPom(pomFileVirtualFileReference: vscode.Uri) {
    // TODO[gumby]: not great that we read this file multiple times
    const pomFileContents = readFileSync(pomFileVirtualFileReference.fsPath, 'utf8')

    const dependencyRegEx = /<dependencies\b[^>]*>(.*?)<\/dependencies>/ms
    const match = dependencyRegEx.exec(pomFileContents)
    const snippet = match ? match[0] : ''

    return snippet
}

async function setAnnotationObjectDetails(lineNumber: number = 0) {
    // Get active diff editor
    const diffEditor = vscode.window.activeTextEditor

    const highlightDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'lightyellow',
        isWholeLine: true,
        gutterIconPath: '/packages/toolkit/resources/icons/cloud9/generated/dark/vscode-bug.svg',
        gutterIconSize: '20',
        overviewRulerColor: new vscode.ThemeColor('warning'),
        overviewRulerLane: vscode.OverviewRulerLane.Center,
    })

    // Set the decorations
    diffEditor?.setDecorations(highlightDecorationType, [
        {
            range: new vscode.Range(lineNumber, 0, lineNumber, 50),
            hoverMessage: `
            ### This dependency version needs to be updated
            
            Use the Q Chat to select a valid version upgrade
        `,
        },
    ])
}

function findLineNumber(uri: vscode.Uri, searchString: string): number | undefined {
    const textDocument = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString())
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
export async function parseVersionsListFromPomFile(pathToXmlOutput: string): Promise<IParsedXmlDependencyOutput> {
    const xmlString = readFileSync(pathToXmlOutput, 'utf-8')
    const parser = new xml2js.Parser()
    const parsedOutput = await parser.parseStringPromise(xmlString)

    const report = parsedOutput.DependencyUpdatesReport.dependencies[0].dependency[0]

    const latestVersion = report?.lastVersion?.[0]
    const majorVersions = report?.majors?.[0]?.major || []
    const minorVersions = report?.minors?.[0]?.minor || []
    const status = report.status?.[0]

    return { latestVersion, majorVersions, minorVersions, status }
}
