/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'

export async function createPomCopy(pomFileVirtualFileReference: vscode.Uri, fileName: string): Promise<vscode.Uri> {
    try {
        const expectedFilePath = path.join(pomFileVirtualFileReference.fsPath, 'pom.xml')
        const pomFileContents = readFileSync(expectedFilePath)
        const newlyGeneratedTmpPath = path.join(pomFileVirtualFileReference.fsPath, fileName)
        writeFileSync(newlyGeneratedTmpPath, pomFileContents)
        return vscode.Uri.file(newlyGeneratedTmpPath)
    } catch (err) {
        console.log('Error creating pom copy', err)
        throw err
    }
}
export async function replacePomVersion(pomFileVirtualFileReference: vscode.Uri, manifestFileValues: IManifestFile) {
    const pomFile = await vscode.workspace.openTextDocument(pomFileVirtualFileReference)
    const pomFileText = pomFile.getText()
    const pomFileTextWithNewVersion = pomFileText.replace(
        new RegExp(manifestFileValues.sourcePomVersion, 'g'),
        manifestFileValues.hilType
    )
    const newPomFile = await vscode.workspace.openTextDocument({
        language: 'xml',
        content: pomFileTextWithNewVersion,
    })
    await vscode.window.showTextDocument(newPomFile)
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
}

export interface IManifestFile {
    hilType: string
    pomFolderName: string
    sourcePomVersion: string
}

export async function getJsonValuesFromManifestFile(
    manifestFileVirtualFileReference: vscode.Uri
): Promise<IManifestFile> {
    try {
        const expectedFilePath = path.join(manifestFileVirtualFileReference.fsPath, 'manifest.json')
        const manifestFileContents = readFileSync(expectedFilePath)
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
