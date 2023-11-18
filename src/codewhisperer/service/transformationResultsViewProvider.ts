/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import AdmZip from 'adm-zip'
import os from 'os'
import fs from 'fs-extra'
import parseDiff from 'parse-diff'
import path from 'path'
import vscode from 'vscode'

import { randomUUID } from 'crypto'
import { ToolkitError } from '../../shared/errors'
import { ExportIntent } from '@amzn/codewhisperer-streaming'
import { TransformByQReviewStatus, transformByQState } from '../models/model'
import { FeatureDevClient } from '../../amazonqFeatureDev/client/featureDev'

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
            const originalPath = path.join(pathToWorkspace, file.from !== undefined ? file.from : '')
            const tmpChangedPath = path.join(pathToTmpSrcDir, file.to !== undefined ? file.to : '')

            const originalFileExist = fs.existsSync(originalPath)
            const changedFileExists = fs.existsSync(tmpChangedPath)

            if (originalFileExist && changedFileExists) {
                return new ModifiedChangeNode(originalPath, tmpChangedPath)
            } else if (!originalFileExist && changedFileExists) {
                return new AddedChangeNode(originalPath, tmpChangedPath)
            } else if (originalFileExist && !changedFileExists) {
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
    public static readonly viewType = 'aws.amazonq.transformationProposedChangesTree'

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
    private featureDevClient

    constructor(context: vscode.ExtensionContext) {
        this.featureDevClient = new FeatureDevClient()
        const diffModel = new DiffModel()
        const transformDataProvider = new TransformationResultsProvider(diffModel)
        this.changeViewer = vscode.window.createTreeView(TransformationResultsProvider.viewType, {
            treeDataProvider: transformDataProvider,
        })

        vscode.commands.registerCommand('aws.amazonq.transformationHub.reviewChanges.refresh', () =>
            transformDataProvider.refresh()
        )
        vscode.commands.registerCommand('aws.amazonq.transformationHub.reviewChanges.reveal', () => {
            vscode.commands.executeCommand('setContext', 'gumby.transformationProposalReviewInProgress', true)
            const root = diffModel.getRoot()
            if (root) {
                this.changeViewer.reveal(root)
            }
        })

        vscode.commands.registerCommand('aws.amazonq.transformationHub.reviewChanges.startReview', async () => {
            vscode.commands.executeCommand('setContext', 'gumby.reviewState', TransformByQReviewStatus.PreparingReview)
            const pathToArchive = await this.downloadArchive(
                transformByQState.getJobId(),
                ProposedTransformationExplorer.tmpTransformedWorkspaceDir
            )
            const pathContainingArchive = path.dirname(pathToArchive)
            console.log(`Downloaded archive to ${pathToArchive}`)
            const zip = new AdmZip(pathToArchive)
            zip.extractAllTo(ProposedTransformationExplorer.tmpTransformedWorkspaceDir)

            const workspaceFolders = vscode.workspace.workspaceFolders!
            diffModel.parseDiff(
                path.join(pathContainingArchive, ProposedTransformationExplorer.pathToDiffPatch),
                path.join(pathContainingArchive, ProposedTransformationExplorer.pathToSrcDir),
                workspaceFolders[0].uri.fsPath
            )

            vscode.commands.executeCommand('setContext', 'gumby.reviewState', TransformByQReviewStatus.InReview)
            transformDataProvider.refresh()
        })

        vscode.commands.registerCommand('aws.amazonq.transformationHub.reviewChanges.acceptChanges', () => {
            diffModel.saveChanges()
            vscode.commands.executeCommand('setContext', 'gumby.transformationProposalReviewInProgress', false)
            vscode.commands.executeCommand(
                'setContext',
                'gumby.reviewState.notStarted',
                TransformByQReviewStatus.NotStarted
            )
            transformDataProvider.refresh()
        })

        vscode.commands.registerCommand('aws.amazonq.transformationHub.reviewChanges.rejectChanges', () => {
            diffModel.rejectChanges()
            vscode.commands.executeCommand('setContext', 'gumby.transformationProposalReviewInProgress', false)
            vscode.commands.executeCommand('setCommand', 'gumby.reviewState', TransformByQReviewStatus.NotStarted)
            transformDataProvider.refresh()
        })
    }

    public async downloadArchive(jobId: string, pathToTmpDir: string) {
        const client = await this.featureDevClient.getStreamingClient()
        const archivePath = path.join(pathToTmpDir, 'ExportResultArchive.zip')
        try {
            const result = await client.exportResultArchive({
                exportId: jobId,
                exportIntent: ExportIntent.TRANSFORMATION,
            })

            const buffer = []
            if (result.body === undefined) {
                throw new ToolkitError('Empty response from CodeWhisperer Streaming service.')
            }

            for await (const chunk of result.body) {
                if (chunk.binaryPayloadEvent) {
                    const chunkData = chunk.binaryPayloadEvent
                    if (chunkData.bytes) {
                        buffer.push(chunkData.bytes)
                    }
                }
            }

            fs.outputFileSync(archivePath, Buffer.concat(buffer))

            return archivePath
        } catch (error) {
            throw new ToolkitError('There was a problem fetching the transformed code.')
        }
    }
}
