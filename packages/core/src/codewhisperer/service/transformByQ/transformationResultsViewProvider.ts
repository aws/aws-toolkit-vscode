/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import AdmZip from 'adm-zip'
import os from 'os'
import fs from 'fs-extra'
import { parsePatch, applyPatches, ParsedDiff } from 'diff'
import path from 'path'
import vscode from 'vscode'
import { ExportIntent } from '@amzn/codewhisperer-streaming'
import { TransformByQReviewStatus, transformByQState } from '../../models/model'
import { ExportResultArchiveStructure, downloadExportResultArchive } from '../../../shared/utilities/download'
import { getLogger } from '../../../shared/logger'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { codeTransformTelemetryState } from '../../../amazonqGumby/telemetry/codeTransformTelemetryState'
import { calculateTotalLatency } from '../../../amazonqGumby/telemetry/codeTransformTelemetry'
import { MetadataResult } from '../../../shared/telemetry/telemetryClient'
import * as CodeWhispererConstants from '../../models/constants'
import { createCodeWhispererChatStreamingClient } from '../../../shared/clients/codewhispererChatClient'
import { ChatSessionManager } from '../../../amazonqGumby/chat/storages/chatSession'

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

enum ReviewState {
    ToReview,
    Reviewed_Accepted,
    Reviewed_Rejected,
}

export class DiffModel {
    changes: ProposedChangeNode[] = []

    /**
     * This function creates a copy of the changed files of the user's project so that the diff.patch can be applied to them
     * @param pathToWorkspace Path to the project that was transformed
     * @param changedFiles List of files that were changed
     * @returns Path to the folder containing the copied files
     */
    public copyProject(pathToWorkspace: string, changedFiles: ParsedDiff[]) {
        const pathToTmpSrcDir = path.join(os.tmpdir(), `project-copy-${Date.now()}`)
        fs.mkdirSync(pathToTmpSrcDir)
        changedFiles.forEach(file => {
            const pathToTmpFile = path.join(pathToTmpSrcDir, file.oldFileName!.substring(2))
            // use mkdirsSync to create parent directories in pathToTmpFile too
            fs.mkdirsSync(path.dirname(pathToTmpFile))
            const pathToOldFile = path.join(pathToWorkspace, file.oldFileName!.substring(2))
            // pathToOldFile will not exist for new files such as summary.md
            if (fs.existsSync(pathToOldFile)) {
                fs.copyFileSync(pathToOldFile, pathToTmpFile)
            }
        })
        return pathToTmpSrcDir
    }

    /**
     * @param pathToDiff Path to the diff.patch file expected to be located in the archive returned by ExportResultsArchive
     * @param pathToWorkspace Path to the project that was transformed
     * @returns List of nodes containing the paths of files that were modified, added, or removed
     */
    public parseDiff(pathToDiff: string, pathToWorkspace: string): ProposedChangeNode[] {
        const diffContents = fs.readFileSync(pathToDiff, 'utf8')
        const changedFiles = parsePatch(diffContents)
        // path to the directory containing copy of the changed files in the transformed project
        const pathToTmpSrcDir = this.copyProject(pathToWorkspace, changedFiles)
        transformByQState.setProjectCopyFilePath(pathToTmpSrcDir)

        applyPatches(changedFiles, {
            loadFile: function (fileObj, callback) {
                // load original contents of file
                const filePath = path.join(pathToWorkspace, fileObj.oldFileName!.substring(2))
                if (!fs.existsSync(filePath)) {
                    // must be a new file (ex. summary.md), so pass empty string as original contents and do not pass error
                    callback(undefined, '')
                } else {
                    // must be a modified file (most common), so pass original contents
                    const fileContents = fs.readFileSync(filePath, 'utf-8')
                    callback(undefined, fileContents)
                }
            },
            // by now, 'content' contains the changes from the patch
            patched: function (fileObj, content, callback) {
                const filePath = path.join(pathToTmpSrcDir, fileObj.newFileName!.substring(2))
                // write changed contents to the copy of the original file (or create a new file)
                fs.writeFileSync(filePath, content)
                callback(undefined)
            },
            complete: function (err) {
                if (err) {
                    getLogger().error(`CodeTransformation: ${err} when applying patch`)
                } else {
                    getLogger().info('CodeTransformation: Patch applied successfully')
                }
            },
        })
        this.changes = changedFiles.flatMap(file => {
            /* ex. file.oldFileName = 'a/src/java/com/project/component/MyFile.java'
             * ex. file.newFileName = 'b/src/java/com/project/component/MyFile.java'
             * use substring(2) to ignore the 'a/' and 'b/'
             */
            const originalPath = path.join(pathToWorkspace, file.oldFileName!.substring(2))
            const tmpChangedPath = path.join(pathToTmpSrcDir, file.newFileName!.substring(2))

            const originalFileExists = fs.existsSync(originalPath)
            const changedFileExists = fs.existsSync(tmpChangedPath)

            if (originalFileExists && changedFileExists) {
                return new ModifiedChangeNode(originalPath, tmpChangedPath)
            } else if (!originalFileExists && changedFileExists) {
                return new AddedChangeNode(originalPath, tmpChangedPath)
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

    constructor(context: vscode.ExtensionContext) {
        const diffModel = new DiffModel()
        const transformDataProvider = new TransformationResultsProvider(diffModel)
        this.changeViewer = vscode.window.createTreeView(TransformationResultsProvider.viewType, {
            treeDataProvider: transformDataProvider,
        })

        const reset = async () => {
            await vscode.commands.executeCommand('setContext', 'gumby.transformationProposalReviewInProgress', false)
            await vscode.commands.executeCommand('setContext', 'gumby.reviewState', TransformByQReviewStatus.NotStarted)

            // delete result archive after changes cleared
            // Summary is under ResultArchiveFilePath
            fs.rmSync(transformByQState.getResultArchiveFilePath(), { recursive: true, force: true })
            fs.rmSync(transformByQState.getProjectCopyFilePath(), { recursive: true, force: true })

            diffModel.clearChanges()
            transformByQState.setSummaryFilePath('')
            transformByQState.setProjectCopyFilePath('')
            transformByQState.setResultArchiveFilePath('')
            transformDataProvider.refresh()
        }

        vscode.commands.registerCommand('aws.amazonq.transformationHub.reviewChanges.refresh', () =>
            transformDataProvider.refresh()
        )

        vscode.commands.registerCommand('aws.amazonq.transformationHub.reviewChanges.reset', async () => await reset())

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

            const pathToArchive = path.join(
                ProposedTransformationExplorer.TmpDir,
                transformByQState.getJobId(),
                'ExportResultsArchive.zip'
            )

            let downloadErrorMessage = undefined

            const cwStreamingClient = await createCodeWhispererChatStreamingClient()
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
                downloadErrorMessage = (e as Error).message
                // This allows the customer to retry the download
                void vscode.window.showErrorMessage(CodeWhispererConstants.errorDownloadingDiffNotification)
                transformByQState.getChatControllers()?.transformationFinished.fire({
                    message: CodeWhispererConstants.errorDownloadingDiffChatMessage,
                    tabID: ChatSessionManager.Instance.getSession().tabID,
                })
                await vscode.commands.executeCommand(
                    'setContext',
                    'gumby.reviewState',
                    TransformByQReviewStatus.NotStarted
                )
                getLogger().error(`CodeTransformation: ExportResultArchive error = ${downloadErrorMessage}`)
                telemetry.codeTransform_logApiError.emit({
                    codeTransformApiNames: 'ExportResultArchive',
                    codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                    codeTransformJobId: transformByQState.getJobId(),
                    codeTransformApiErrorMessage: downloadErrorMessage,
                    codeTransformRequestId: e.requestId ?? '',
                    result: MetadataResult.Fail,
                    reason: 'ExportResultArchiveFailed',
                })
                throw new Error('Error downloading diff')
            } finally {
                // This metric is emitted when user clicks Download Proposed Changes button
                telemetry.codeTransform_vcsViewerClicked.emit({
                    codeTransformVCSViewerSrcComponents: 'toastNotification',
                    codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                    codeTransformJobId: transformByQState.getJobId(),
                    result: downloadErrorMessage ? MetadataResult.Fail : MetadataResult.Pass,
                    reason: downloadErrorMessage,
                })
            }

            const exportResultsArchiveSize = (await fs.promises.stat(pathToArchive)).size

            let deserializeErrorMessage = undefined
            const deserializeArchiveStartTime = Date.now()
            let pathContainingArchive = ''
            try {
                // Download and deserialize the zip
                pathContainingArchive = path.dirname(pathToArchive)
                const zip = new AdmZip(pathToArchive)
                zip.extractAllTo(pathContainingArchive)
                diffModel.parseDiff(
                    path.join(pathContainingArchive, ExportResultArchiveStructure.PathToDiffPatch),
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
                transformByQState.setResultArchiveFilePath(pathContainingArchive)
                await vscode.commands.executeCommand('setContext', 'gumby.isSummaryAvailable', true)

                // This metric is only emitted when placed before showInformationMessage
                telemetry.codeTransform_vcsDiffViewerVisible.emit({
                    codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                    codeTransformJobId: transformByQState.getJobId(),
                    result: MetadataResult.Pass,
                })

                // Do not await this so that the summary reveals without user needing to close this notification
                void vscode.window.showInformationMessage(CodeWhispererConstants.viewProposedChangesNotification)
                transformByQState.getChatControllers()?.transformationFinished.fire({
                    message: CodeWhispererConstants.viewProposedChangesChatMessage,
                    tabID: ChatSessionManager.Instance.getSession().tabID,
                })
                await vscode.commands.executeCommand('aws.amazonq.transformationHub.summary.reveal')
            } catch (e: any) {
                deserializeErrorMessage = (e as Error).message
                getLogger().error(`CodeTransformation: ParseDiff error = ${deserializeErrorMessage}`)
                transformByQState.getChatControllers()?.transformationFinished.fire({
                    message: CodeWhispererConstants.errorDeserializingDiffChatMessage,
                    tabID: ChatSessionManager.Instance.getSession().tabID,
                })
                void vscode.window.showErrorMessage(CodeWhispererConstants.errorDeserializingDiffNotification)
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
        })

        vscode.commands.registerCommand('aws.amazonq.transformationHub.reviewChanges.acceptChanges', async () => {
            diffModel.saveChanges()
            telemetry.ui_click.emit({ elementId: 'transformationHub_acceptChanges' })
            await vscode.window.showInformationMessage(CodeWhispererConstants.changesAppliedNotification)
            transformByQState.getChatControllers()?.transformationFinished.fire({
                message: CodeWhispererConstants.changesAppliedChatMessage,
                tabID: ChatSessionManager.Instance.getSession().tabID,
            })
            await reset()
            telemetry.codeTransform_vcsViewerSubmitted.emit({
                codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                codeTransformJobId: transformByQState.getJobId(),
                codeTransformStatus: transformByQState.getStatus(),
                result: MetadataResult.Pass,
            })
        })

        vscode.commands.registerCommand('aws.amazonq.transformationHub.reviewChanges.rejectChanges', async () => {
            diffModel.rejectChanges()
            await reset()
            telemetry.ui_click.emit({ elementId: 'transformationHub_rejectChanges' })
            telemetry.codeTransform_vcsViewerCanceled.emit({
                // eslint-disable-next-line id-length
                codeTransformPatchViewerCancelSrcComponents: 'cancelButton',
                codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                codeTransformJobId: transformByQState.getJobId(),
                codeTransformStatus: transformByQState.getStatus(),
                result: MetadataResult.Pass,
            })
        })
    }
}
