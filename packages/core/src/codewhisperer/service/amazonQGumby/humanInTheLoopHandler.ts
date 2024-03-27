/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import xml2js = require('xml2js')
import * as vscode from 'vscode'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { transformByQState } from '../../models/model'
import { spawnSync } from 'child_process'
import { TransformationStep } from '../../client/codewhispereruserclient'
import * as CodeWhispererConstants from '../../models/constants'
import { FolderInfo } from '../transformByQHandler'

export interface IManifestFile {
    hilType: string
    pomFolderName: string
    sourcePomVersion: string
}

export function getArtifactIdentifiers(transformationSteps: TransformationStep[]) {
    console.log('In getArtifactIdentifiers', transformationSteps)
    // const artifactType = transformationSteps[0]?.artifactType
    // const artifactId = transformationSteps[0]?.artifactId
    const artifactType = 'hil'
    const artifactId = 'test-id'
    return {
        artifactId,
        artifactType,
    }
}

export async function createPomCopy(
    dirname: string,
    pomFileVirtualFileReference: vscode.Uri,
    fileName: string
): Promise<vscode.Uri> {
    console.log('In createPomCopy', dirname, pomFileVirtualFileReference, fileName)
    try {
        const newFilePath = path.join(dirname, fileName)
        const pomFileContents = readFileSync(pomFileVirtualFileReference.fsPath)
        if (!existsSync(dirname)) {
            mkdirSync(dirname)
        }
        writeFileSync(newFilePath, pomFileContents)
        return vscode.Uri.file(newFilePath)
    } catch (err) {
        console.log('Error creating pom copy', err)
        throw err
    }
}

export async function replacePomVersion(pomFileVirtualFileReference: vscode.Uri, version: string, delimiter: string) {
    console.log('In replacePomVersion', pomFileVirtualFileReference, version, delimiter)
    try {
        const pomFileText = readFileSync(pomFileVirtualFileReference.fsPath, 'utf-8')
        const pomFileTextWithNewVersion = pomFileText.replace(delimiter, version)
        writeFileSync(pomFileVirtualFileReference.fsPath, pomFileTextWithNewVersion)
    } catch (err) {
        console.log('Error replacing pom version', err)
        throw err
    }
}

export async function getJsonValuesFromManifestFile(
    manifestFileVirtualFileReference: vscode.Uri
): Promise<IManifestFile> {
    console.log('Inside getJsonValuesFromManifestFile', manifestFileVirtualFileReference)
    try {
        const manifestFileContents = readFileSync(manifestFileVirtualFileReference.fsPath, 'utf-8')
        const jsonValues = JSON.parse(manifestFileContents.toString())
        return {
            hilType: jsonValues?.hilType,
            pomFolderName: jsonValues?.pomFolderName,
            sourcePomVersion: jsonValues?.sourcePomVersion,
        }
    } catch (err) {
        console.log('Error parsing manifest.json file', err)
        throw err
    }
}

export async function highlightPomIssueInProject(pomFileVirtualFileReference: vscode.Uri, currentVersion: string) {
    console.log('In highlightPomIssueInProject', pomFileVirtualFileReference, currentVersion)
    // Open the editor and set this pom to activeTextEditor
    await vscode.window.showTextDocument(pomFileVirtualFileReference)

    // Find line number for "latestVersion" or set to first line in file
    const highlightLineNumber = findLineNumber(pomFileVirtualFileReference, currentVersion) || 1
    await setWarningIcon(highlightLineNumber)
}

async function setWarningIcon(lineNumber: number = 0) {
    // Get active diff editor
    const diffEditor = vscode.window.activeTextEditor

    const highlightDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'lightgreen',

        isWholeLine: true,
        gutterIconPath:
            '/Users/nardeck/workplace/gumby-prod/aws-toolkit-vscode/packages/toolkit/resources/icons/cloud9/generated/dark/vscode-bug.svg',
        gutterIconSize: '20',
        overviewRulerColor: new vscode.ThemeColor('warning'),
        overviewRulerLane: vscode.OverviewRulerLane.Right,
    })

    // Set the decorations
    diffEditor?.setDecorations(highlightDecorationType, [
        {
            range: new vscode.Range(lineNumber, 0, lineNumber, 50),
            hoverMessage: `### This version needs to be updated. Please see the full list details in the chat
                - latestVersion: 1.18.32
                - majorVersion: 1.12.2
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

export async function parseXmlDependenciesReport(pathToXmlOutput: string) {
    console.log('In parseXmlDependenciesReport', pathToXmlOutput)
    try {
        const xmlString = readFileSync(pathToXmlOutput, 'utf-8')
        const parser = new xml2js.Parser()
        const parsedOutput = await parser.parseStringPromise(xmlString)

        const report = parsedOutput.DependencyUpdatesReport.dependencies[0].dependency[0]

        const latestVersion = report.lastVersion[0]
        const majorVersions = report.majors[0].major
        const minorVersions = report.minors[0].minor

        return { latestVersion, majorVersions, minorVersions }
    } catch (err) {
        console.log('Error in parseXmlDependenciesReport', err)
        throw err
    }
}

// run maven 'versions:dependency-updates-aggregate-report' with either 'mvnw.cmd', './mvnw', or 'mvn' (if wrapper exists, we use that, otherwise we use regular 'mvn')
export function runMavenDependencyUpdateCommands(dependenciesFolder: FolderInfo) {
    console.log('In runMavenDependencyUpdateCommands', dependenciesFolder)
    try {
        // baseCommand will be one of: '.\mvnw.cmd', './mvnw', 'mvn'
        const baseCommand = 'mvn' || transformByQState.getMavenName()

        // transformByQState.appendToErrorLog(`Running command ${baseCommand} clean install`)

        // Note: IntelliJ runs 'clean' separately from 'install'. Evaluate benefits (if any) of this.
        const args = [
            'versions:dependency-updates-aggregate-report',
            `-DoutputDirectory=${dependenciesFolder.path}`,
            '-DonlyProjectDependencies=true',
            '-DdependencyUpdatesReportFormats=xml',
        ]
        let environment = process.env
        // if JAVA_HOME not found or not matching project JDK, get user input for it and set here
        if (transformByQState.getJavaHome() !== undefined) {
            environment = { ...process.env, JAVA_HOME: transformByQState.getJavaHome() }
        }

        const spawnResult = spawnSync(baseCommand, args, {
            cwd: dependenciesFolder.path,
            shell: true,
            encoding: 'utf-8',
            env: environment,
            maxBuffer: CodeWhispererConstants.maxBufferSize,
        })

        if (spawnResult.status !== 0) {
            throw new Error(spawnResult.stderr)
        } else {
            console.log(`Maven succeeded: `, spawnResult.stdout)
            return spawnResult.stdout
        }
    } catch (err) {
        console.log('Error in runMavenDependencyUpdateCommands', err)
        throw err
    }
}

export function runMavenDependencyBuildCommands(dependenciesFolder: FolderInfo) {
    console.log('In runMavenDependencyUpdateCommands', dependenciesFolder)
    try {
        // baseCommand will be one of: '.\mvnw.cmd', './mvnw', 'mvn'
        const baseCommand = 'mvn' || transformByQState.getMavenName()

        // transformByQState.appendToErrorLog(`Running command ${baseCommand} clean install`)

        // Note: IntelliJ runs 'clean' separately from 'install'. Evaluate benefits (if any) of this.
        const args = [
            'dependency:copy-dependencies',
            `-DoutputDirectory=${dependenciesFolder.path}`,
            '-Dmdep.useRepositoryLayout=true',
            '-Dmdep.copyPom=true',
            '-Dmdep.addParentPoms=true',
            '-q',
        ]
        let environment = process.env
        // if JAVA_HOME not found or not matching project JDK, get user input for it and set here
        if (transformByQState.getJavaHome() !== undefined) {
            environment = { ...process.env, JAVA_HOME: transformByQState.getJavaHome() }
        }

        const spawnResult = spawnSync(baseCommand, args, {
            cwd: dependenciesFolder.path,
            shell: true,
            encoding: 'utf-8',
            env: environment,
            maxBuffer: CodeWhispererConstants.maxBufferSize,
        })

        if (spawnResult.status !== 0) {
            throw new Error(spawnResult.stderr)
        } else {
            console.log(`Maven succeeded: `, spawnResult.stdout)
            return spawnResult.stdout
        }
    } catch (err) {
        console.log('Error in runMavenDependencyUpdateCommands', err)
        throw err
    }
}
