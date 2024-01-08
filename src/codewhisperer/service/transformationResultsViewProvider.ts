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

import { ExportIntent } from '@amzn/codewhisperer-streaming'
import { TransformByQReviewStatus, transformByQState } from '../models/model'
import { FeatureDevClient } from '../../amazonqFeatureDev/client/featureDev'
import { ExportResultArchiveStructure, downloadExportResultArchive } from '../../shared/utilities/download'
import { ToolkitError } from '../../shared/errors'
import { getLogger } from '../../shared/logger'
import { telemetry } from '../../shared/telemetry/telemetry'
import { codeTransformTelemetryState } from '../../amazonqGumby/telemetry/codeTransformTelemetryState'
import { calculateTotalLatency } from '../../amazonqGumby/telemetry/codeTransformTelemetry'
import { MetadataResult } from '../../shared/telemetry/telemetryClient'
import * as CodeWhispererConstants from '../models/constants'

export abstract class ProposedChangeNode {
    abstract readonly resourcePath: string

    abstract generateCommand(): vscode.Command
    abstract generateDescription(): string
    abstract saveFile(): void

    public saveChange(): void {
        try {
            this.saveFile()
        } catch (err) {
            //to do: file system-related error handling
            if (err instanceof Error) {
                getLogger().error(err.message)
            }
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
            arguments: [vscode.Uri.file(this.pathToTmpFile)],
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

            const originalFileExists = fs.existsSync(originalPath)
            const changedFileExists = fs.existsSync(tmpChangedPath)

            if (originalFileExists && changedFileExists) {
                return new ModifiedChangeNode(originalPath, tmpChangedPath)
            } else if (!originalFileExists && changedFileExists) {
                return new AddedChangeNode(originalPath, tmpChangedPath)
            } else if (originalFileExists && !changedFileExists) {
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

    public static TmpDir = os.tmpdir()
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
        vscode.commands.registerCommand('aws.amazonq.transformationHub.reviewChanges.reveal', async () => {
            await vscode.commands.executeCommand('setContext', 'gumby.transformationProposalReviewInProgress', true)
            const root = diffModel.getRoot()
            if (root) {
                await this.changeViewer.reveal(root, {
                    expand: true,
                })
            }
        })

        vscode.commands.registerCommand('aws.amazonq.transformationHub.summary.reveal', async () => {
            if (transformByQState.getSummaryFilePath() !== '') {
                await vscode.commands.executeCommand(
                    'markdown.showPreview',
                    vscode.Uri.file(transformByQState.getSummaryFilePath())
                )
                telemetry.ui_click.emit({ elementId: 'transformationHub_viewSummary' })
            }
        })

        vscode.commands.registerCommand('aws.amazonq.transformationHub.reviewChanges.startReview', async () => {
            await vscode.commands.executeCommand(
                'setContext',
                'gumby.reviewState',
                TransformByQReviewStatus.PreparingReview
            )
            telemetry.ui_click.emit({ elementId: 'transformationHub_startDownloadExportResultArchive' })

            // This metric is emitted when user clicked download for proposed change
            telemetry.codeTransform_vcsViewerClicked.emit({
                codeTransformVCSViewerSrcComponents: 'toastNotification',
                codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                codeTransformJobId: transformByQState.getJobId(),
            })
            const pathToArchive = path.join(
                ProposedTransformationExplorer.TmpDir,
                transformByQState.getJobId(),
                'ExportResultsArchive.zip'
            )
            const cwStreamingClient = await this.featureDevClient.getStreamingClient()
            try {
                await downloadExportResultArchive(
                    cwStreamingClient,
                    {
                        exportId: transformByQState.getJobId(),
                        exportIntent: ExportIntent.TRANSFORMATION,
                    },
                    pathToArchive
                )
            } catch (e: any) {
                // This allows the customer to retry the download
                void vscode.window.showErrorMessage(CodeWhispererConstants.errorDownloadingDiffMessage)
                await vscode.commands.executeCommand(
                    'setContext',
                    'gumby.reviewState',
                    TransformByQReviewStatus.NotStarted
                )
                const errorMessage = 'There was a problem fetching the transformed code.'
                getLogger().error('CodeTransform: ExportResultArchive error = ', errorMessage)
                telemetry.codeTransform_logApiError.emit({
                    codeTransformApiNames: 'ExportResultArchive',
                    codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                    codeTransformJobId: transformByQState.getJobId(),
                    codeTransformApiErrorMessage: e?.message || errorMessage,
                    codeTransformRequestId: e?.requestId,
                    result: MetadataResult.Fail,
                    reason: 'ExportResultArchiveFailed',
                })
                throw new ToolkitError(errorMessage)
            }

            const exportResultsArchiveSize = (await fs.promises.stat(pathToArchive)).size

            let deserializeErrorMessage
            const deserializeArchiveStartTime = Date.now()
            let pathContainingArchive = ''
            try {
                // Download and deserialize the zip
                pathContainingArchive = path.dirname(pathToArchive)
                const zip = new AdmZip(pathToArchive)
                zip.extractAllTo(pathContainingArchive)
                diffModel.parseDiff(
                    path.join(pathContainingArchive, ExportResultArchiveStructure.PathToDiffPatch),
                    path.join(pathContainingArchive, ExportResultArchiveStructure.PathToSourceDir),
                    transformByQState.getProjectPath()
                )
                await vscode.commands.executeCommand(
                    'setContext',
                    'gumby.reviewState',
                    TransformByQReviewStatus.InReview
                )
                transformDataProvider.refresh()
                transformByQState.setSummaryFilePath(
                    path.join(pathContainingArchive, ExportResultArchiveStructure.PathToSummary)
                )
            } catch (e: any) {
                deserializeErrorMessage =
                    e?.message ||
                    'Transform by Q experienced an error during the deserialization of the downloaded result archive'
                getLogger().error('CodeTransform: ParseDiff error = ', deserializeErrorMessage)
                vscode.window.showErrorMessage(deserializeErrorMessage)
            } finally {
                telemetry.codeTransform_jobArtifactDownloadAndDeserializeTime.emit({
                    codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                    codeTransformJobId: transformByQState.getJobId(),
                    codeTransformRunTimeLatency: calculateTotalLatency(deserializeArchiveStartTime),
                    codeTransformTotalByteSize: exportResultsArchiveSize,
                    codeTransformRuntimeError: deserializeErrorMessage,
                    result: deserializeErrorMessage ? MetadataResult.Fail : MetadataResult.Pass,
                    reason: deserializeErrorMessage ? 'DeserializationFailed' : undefined,
                })
            }

            transformByQState.setResultArchiveFilePath(pathContainingArchive)

            // This metric is only emitted when placed before showInformationMessage
            telemetry.codeTransform_vcsDiffViewerVisible.emit({
                codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                codeTransformJobId: transformByQState.getJobId(),
                result: MetadataResult.Pass,
            })

            await vscode.window.showInformationMessage(CodeWhispererConstants.viewProposedChangesMessage)
            await vscode.commands.executeCommand('aws.amazonq.transformationHub.summary.reveal')
        })

        vscode.commands.registerCommand('aws.amazonq.transformationHub.reviewChanges.acceptChanges', async () => {
            diffModel.saveChanges()
            telemetry.ui_click.emit({ elementId: 'transformationHub_acceptChanges' })
            await vscode.commands.executeCommand('setContext', 'gumby.transformationProposalReviewInProgress', false)
            await vscode.commands.executeCommand('setContext', 'gumby.reviewState', TransformByQReviewStatus.NotStarted)
            transformDataProvider.refresh()
            await vscode.window.showInformationMessage(CodeWhispererConstants.changesAppliedMessage)
            fs.rmSync(transformByQState.getResultArchiveFilePath(), { recursive: true, force: true }) // delete result archive after changes accepted
            telemetry.codeTransform_vcsViewerSubmitted.emit({
                codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                codeTransformJobId: transformByQState.getJobId(),
                result: MetadataResult.Pass,
            })
        })

        vscode.commands.registerCommand('aws.amazonq.transformationHub.reviewChanges.rejectChanges', async () => {
            diffModel.rejectChanges()
            telemetry.ui_click.emit({ elementId: 'transformationHub_rejectChanges' })
            await vscode.commands.executeCommand('setContext', 'gumby.transformationProposalReviewInProgress', false)
            await vscode.commands.executeCommand('setContext', 'gumby.reviewState', TransformByQReviewStatus.NotStarted)
            transformDataProvider.refresh()
            fs.rmSync(transformByQState.getResultArchiveFilePath(), { recursive: true, force: true }) // delete result archive after changes rejected
            telemetry.codeTransform_vcsViewerCanceled.emit({
                // eslint-disable-next-line id-length
                codeTransformPatchViewerCancelSrcComponents: 'cancelButton',
                codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                codeTransformJobId: transformByQState.getJobId(),
                result: MetadataResult.Pass,
            })
        })
    }
}
