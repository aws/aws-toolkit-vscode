/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'os'
import fs from 'fs-extra'
import parseDiff from 'parse-diff'
import path from 'path'
import vscode from 'vscode'

import { randomUUID } from 'crypto'

export abstract class ProposedChangeNode {
    abstract readonly resourcePath: string

    abstract generateCommand(): vscode.Command
    abstract generateDescription(): string
    abstract saveFile(): void

    public saveChange(): void {
        try {
            this.saveFile()
        } catch (error) {
            //to do: file system-related error handling
            console.log(error)
        }
    }

    reviewState: ReviewState = ReviewState.ToReview
}

export class ModifiedChangeNode extends ProposedChangeNode {
    readonly originalPath: string
    readonly tmpChangedPath: string
    override resourcePath: string

    constructor(originalPath: string, tmpChangedPath: string) {
        super()
        this.originalPath = originalPath
        this.tmpChangedPath = tmpChangedPath

        this.resourcePath = tmpChangedPath
    }

    override generateCommand(): vscode.Command {
        return {
            command: 'vscode.diff',
            arguments: [vscode.Uri.file(this.originalPath), vscode.Uri.file(this.tmpChangedPath)],
            title: `${path.basename(this.originalPath)}: Original <-> ${path.basename(this.tmpChangedPath)}`,
        }
    }
    override generateDescription(): string {
        return 'M'
    }

    override saveFile(): void {
        fs.copyFileSync(this.tmpChangedPath, this.originalPath)
    }
}

export class AddedChangeNode extends ProposedChangeNode {
    readonly pathToTmpFile: string
    readonly pathToWorkspaceFile: string

    override resourcePath: string

    constructor(pathToWorkspaceFile: string, pathToTmpFile: string) {
        super()
        this.pathToWorkspaceFile = pathToWorkspaceFile
        this.pathToTmpFile = pathToTmpFile

        this.resourcePath = pathToTmpFile
    }

    override generateCommand(): vscode.Command {
        return {
            command: 'vscode.open',
            arguments: [vscode.Uri.file(this.pathToWorkspaceFile)],
            title: 'Added Change',
        }
    }
    override generateDescription(): string {
        return 'A'
    }

    override saveFile(): void {
        fs.copyFileSync(this.pathToTmpFile, this.pathToWorkspaceFile)
    }
}

export class RemovedChangeNode extends ProposedChangeNode {
    readonly pathToOldContents: string
    override resourcePath: string

    constructor(pathToOldContents: string) {
        super()
        this.pathToOldContents = pathToOldContents
        this.resourcePath = pathToOldContents
    }

    override generateCommand(): vscode.Command {
        return {
            command: 'vscode.open',
            arguments: [vscode.Uri.file(this.pathToOldContents)],
            title: 'Removed Change',
        }
    }
    override generateDescription(): string {
        return 'R'
    }
    override saveFile(): void {
        fs.removeSync(this.pathToOldContents)
    }
}

enum ReviewState {
    ToReview,
    Reviewed_Accepted,
    Reviewed_Rejected,
}

export class DiffModel {
    changes: ProposedChangeNode[] = []

    /**
     *
     * @param pathToDiff Path to the diff.patch file expected to be located in the archive returned by ExportResultsArchive
     * @param pathToTmpSrcDir Path to the directory containing changed source files
     * @param pathToWorkspace Path to the current open workspace directory
     * @returns
     */
    public parseDiff(pathToDiff: string, pathToTmpSrcDir: string, pathToWorkspace: string): ProposedChangeNode[] {
        const diffContents = fs.readFileSync(pathToDiff, 'utf8')
        const changedFiles = parseDiff(diffContents)

        this.changes = changedFiles.flatMap(file => {
            const originalPath = path.join(pathToWorkspace, file.from!) // what happens if these don't exist?
            const tmpChangedPath = path.join(pathToTmpSrcDir, file.to!)

            if (fs.existsSync(originalPath) && fs.existsSync(tmpChangedPath)) {
                return new ModifiedChangeNode(originalPath, tmpChangedPath)
            } else if (!fs.existsSync(originalPath) && fs.existsSync(tmpChangedPath)) {
                return new AddedChangeNode(originalPath, tmpChangedPath)
            } else if (fs.existsSync(originalPath) && !fs.existsSync(tmpChangedPath)) {
                return new RemovedChangeNode(originalPath)
            }
            return []
        })

        return this.changes
    }

    public getChanges() {
        return this.changes
    }

    public getRoot() {
        return this.changes[0]
    }

    public saveChanges() {
        this.changes.forEach(file => {
            file.saveChange()
        })

        this.clearChanges()
    }

    public rejectChanges() {
        this.clearChanges()
    }

    public clearChanges() {
        this.changes = []
    }
}

export class TransformationResultsProvider implements vscode.TreeDataProvider<ProposedChangeNode> {
    public static readonly viewType = 'aws.codeWhisperer.transformationProposedChangesTree'

    private _onDidChangeTreeData: vscode.EventEmitter<any> = new vscode.EventEmitter<any>()
    readonly onDidChangeTreeData: vscode.Event<any> = this._onDidChangeTreeData.event

    constructor(private readonly model: DiffModel) {}

    public refresh(): any {
        this._onDidChangeTreeData.fire(undefined)
    }

    public getTreeItem(element: ProposedChangeNode): vscode.TreeItem {
        const treeItem = {
            resourceUri: vscode.Uri.file(element.resourcePath),
            command: element.generateCommand(),
            description: element.generateDescription(),
        }
        return treeItem
    }

    public getChildren(element?: ProposedChangeNode): ProposedChangeNode[] | Thenable<ProposedChangeNode[]> {
        return element ? Promise.resolve([]) : this.model.getChanges()
    }

    public getParent(element: ProposedChangeNode): ProposedChangeNode | undefined {
        return undefined
    }
}

export class ProposedTransformationExplorer {
    private changeViewer: vscode.TreeView<ProposedChangeNode>

    public static pathToDiffPatch = path.join('patch', 'diff.patch')
    public static pathToSrcDir = 'sources'
    public static tmpTransformedWorkspaceDir = path.join(os.tmpdir(), randomUUID())

    constructor(context: vscode.ExtensionContext) {
        const diffModel = new DiffModel()
        const transformDataProvider = new TransformationResultsProvider(diffModel)
        this.changeViewer = vscode.window.createTreeView(TransformationResultsProvider.viewType, {
            treeDataProvider: transformDataProvider,
        })

        vscode.commands.registerCommand('aws.codeWhisperer.reviewTransformationChanges.refresh', () =>
            transformDataProvider.refresh()
        )
        vscode.commands.registerCommand('aws.codeWhisperer.reviewTransformationChanges.reveal', () => {
            vscode.commands.executeCommand('setContext', 'gumby.transformationProposalInProgress', true)
            const root = diffModel.getRoot()
            if (root) {
                this.changeViewer.reveal(root)
            }
        })

        vscode.commands.registerCommand('aws.codeWhisperer.reviewTransformationChanges.processDiff', () => {
            const workspaceFolders = vscode.workspace.workspaceFolders!
            diffModel.parseDiff(
                path.join(
                    ProposedTransformationExplorer.tmpTransformedWorkspaceDir,
                    ProposedTransformationExplorer.pathToDiffPatch
                ),
                path.join(
                    ProposedTransformationExplorer.tmpTransformedWorkspaceDir,
                    ProposedTransformationExplorer.pathToSrcDir
                ),
                workspaceFolders[0].uri.fsPath
            )
            transformDataProvider.refresh()
        })

        vscode.commands.registerCommand('aws.codewhisperer.transformationHub.acceptChanges', () => {
            diffModel.saveChanges()
            vscode.commands.executeCommand('setContext', 'gumby.transformationProposalInProgress', false)
            transformDataProvider.refresh()
        })

        vscode.commands.registerCommand('aws.codewhisperer.transformationHub.rejectChanges', () => {
            diffModel.rejectChanges()
            vscode.commands.executeCommand('setContext', 'gumby.transformationProposalInProgress', false)
            transformDataProvider.refresh()
        })
    }
}
