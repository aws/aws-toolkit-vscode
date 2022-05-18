/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { SystemUtilities } from '../../shared/systemUtilities'
import { ConstructTree } from './tree/types'

export interface CdkApp {
    location: CdkAppLocation
    constructTree: ConstructTree
}

export interface CdkAppLocation {
    cdkJsonUri: vscode.Uri
    treeUri: vscode.Uri
}

export async function getApp(location: CdkAppLocation): Promise<CdkApp> {
    const constructTree = JSON.parse(await SystemUtilities.readFile(location.treeUri)) as ConstructTree

    return { location, constructTree }
}

export class CdkProject {
    private readonly outputWatcher = this.createWatcher(this.outputDir)
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChange = this.onDidChangeEmitter.event

    public constructor(public readonly manifest: vscode.Uri, private readonly outputDir: vscode.Uri) {}

    public async getApp(): Promise<CdkApp> {
        const treeUri = vscode.Uri.joinPath(this.outputDir, 'tree.json')
        const constructTree = JSON.parse(await SystemUtilities.readFile(treeUri)) as ConstructTree

        return {
            constructTree,
            location: { cdkJsonUri: this.manifest, treeUri },
        }
    }

    public dispose(): void {
        this.outputWatcher.dispose()
        this.onDidChangeEmitter.dispose()
    }

    private createWatcher(outputDir: vscode.Uri): vscode.FileSystemWatcher {
        const pattern = new vscode.RelativePattern(outputDir.path, 'tree.json')
        const watcher = vscode.workspace.createFileSystemWatcher(pattern)

        watcher.onDidChange(() => this.onDidChangeEmitter.fire())
        watcher.onDidCreate(() => this.onDidChangeEmitter.fire())
        watcher.onDidDelete(() => this.onDidChangeEmitter.fire())

        return watcher
    }

    public static async getOutputDir(manifest: vscode.Uri): Promise<vscode.Uri> {
        const root = vscode.Uri.joinPath(manifest, '..')
        const cdkJsonDoc = await vscode.workspace.openTextDocument(manifest)
        const { output = 'cdk.out' } = JSON.parse(cdkJsonDoc.getText())

        return vscode.Uri.parse(`${manifest.scheme}:`, true).with({
            path: path.resolve(root.path, output),
        })
    }

    public static async fromManifest(manifest: vscode.Uri): Promise<CdkProject> {
        const outputDir = await this.getOutputDir(manifest)

        return new this(manifest, outputDir)
    }
}
