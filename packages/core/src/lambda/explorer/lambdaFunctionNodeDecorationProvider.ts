/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { fs } from '../../shared/fs/fs'
import path from 'path'
import { getFunctionInfo } from '../utils'
import { LambdaFunction } from '../commands/uploadLambda'

export class LambdaFunctionNodeDecorationProvider implements vscode.FileDecorationProvider {
    // Make it a singleton so that it's easier to access
    private static instance: LambdaFunctionNodeDecorationProvider
    private readonly _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | undefined>()
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event

    private constructor() {}

    public static getInstance(): LambdaFunctionNodeDecorationProvider {
        if (!LambdaFunctionNodeDecorationProvider.instance) {
            LambdaFunctionNodeDecorationProvider.instance = new LambdaFunctionNodeDecorationProvider()
        }
        return LambdaFunctionNodeDecorationProvider.instance
    }

    async provideFileDecoration(uri: vscode.Uri): Promise<vscode.FileDecoration | undefined> {
        const badge = {
            badge: 'M',
            color: new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'),
            tooltip: 'This function has undeployed changes',
            propagate: true,
        }

        if (uri.scheme === 'lambda') {
            const [region, name] = uri.path.split('/')
            const lambda: LambdaFunction = { region, name }
            if (await getFunctionInfo(lambda, 'undeployed')) {
                badge.propagate = false
                return badge
            }
        } else {
            try {
                const lambda = this.getLambdaFromPath(uri)
                if (lambda && (await this.isFileModifiedAfterDeployment(uri.fsPath, lambda))) {
                    return badge
                }
            } catch {
                return undefined
            }
        }
    }

    public async addBadge(fileUri: vscode.Uri, functionUri: vscode.Uri) {
        this._onDidChangeFileDecorations.fire(vscode.Uri.file(fileUri.fsPath))
        this._onDidChangeFileDecorations.fire(functionUri)
    }

    public async removeBadge(fileUri: vscode.Uri, functionUri: vscode.Uri) {
        // We need to propagate the badge removal down to all files in the dir
        for (const path of await this.getFilePaths(fileUri.fsPath)) {
            const subUri = vscode.Uri.file(path)
            this._onDidChangeFileDecorations.fire(subUri)
        }
        this._onDidChangeFileDecorations.fire(functionUri)
    }

    private async getFilePaths(basePath: string) {
        const files = await fs.readdir(basePath)
        const subFiles: string[] = [basePath]
        for (const file of files) {
            const [fileName, type] = file
            const filePath = path.join(basePath, fileName)
            if (type === vscode.FileType.Directory) {
                subFiles.push(...(await this.getFilePaths(filePath)))
            } else {
                subFiles.push(filePath)
            }
        }

        return subFiles
    }

    private getLambdaFromPath(uri: vscode.Uri): LambdaFunction {
        const pathParts = uri.fsPath.split(path.sep)
        const lambdaIndex = pathParts.indexOf('lambda')
        if (lambdaIndex === -1 || lambdaIndex + 2 >= pathParts.length) {
            throw new Error('Invalid path')
        }
        const region = pathParts[lambdaIndex + 1]
        const name = pathParts[lambdaIndex + 2]
        return { region, name }
    }

    private async isFileModifiedAfterDeployment(filePath: string, lambda: LambdaFunction): Promise<boolean> {
        try {
            const { lastDeployed, undeployed } = await getFunctionInfo(lambda)
            if (!lastDeployed || !undeployed) {
                return false
            }

            const fileStat = await fs.stat(filePath)
            return fileStat.mtime > lastDeployed
        } catch {
            return false
        }
    }
}
