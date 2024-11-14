/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import AdmZip from 'adm-zip'
import os from 'os'
import fs from 'fs' // eslint-disable-line no-restricted-imports
import { parsePatch, applyPatches, ParsedDiff } from 'diff'
import path from 'path'
import vscode from 'vscode'
import { ExportIntent } from '@amzn/codewhisperer-streaming'
import { TransformByQReviewStatus, transformByQState, PatchInfo, DescriptionContent } from '../../models/model'
import { ExportResultArchiveStructure, downloadExportResultArchive } from '../../../shared/utilities/download'
import { getLogger } from '../../../shared/logger'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { CodeTransformTelemetryState } from '../../../amazonqGumby/telemetry/codeTransformTelemetryState'
import { MetadataResult } from '../../../shared/telemetry/telemetryClient'
import * as CodeWhispererConstants from '../../models/constants'
import { createCodeWhispererChatStreamingClient } from '../../../shared/clients/codewhispererChatClient'
import { ChatSessionManager } from '../../../amazonqGumby/chat/storages/chatSession'
import { setContext } from '../../../shared/vscode/setContext'
import * as codeWhisperer from '../../client/codewhisperer'

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
        // create parent directory before copying files (ex. for the summary/ and assets/ folders)
        const parentDir = path.dirname(this.pathToWorkspaceFile)
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true })
        }
        fs.copyFileSync(this.pathToTmpFile, this.pathToWorkspaceFile)
    }
}

export class PatchFileNode {
    label: string
    readonly patchFilePath: string
    children: ProposedChangeNode[] = []

    constructor(description: PatchInfo | undefined = undefined, patchFilePath: string) {
        this.patchFilePath = patchFilePath
        this.label = description
            ? `${description.name} (${description.isSuccessful ? 'Success' : 'Failure'})`
            : path.basename(patchFilePath)
    }
}

enum ReviewState {
    ToReview,
    Reviewed_Accepted,
    Reviewed_Rejected,
}

export class DiffModel {
    patchFileNodes: PatchFileNode[] = []
    currentPatchIndex: number = 0

    /**
     * This function creates a copy of the changed files of the user's project so that the diff.patch can be applied to them
     * @param pathToWorkspace Path to the project that was transformed
     * @param changedFiles List of files that were changed
     * @returns Path to the folder containing the copied files
     */
    public copyProject(pathToWorkspace: string, changedFiles: ParsedDiff[]) {
        const pathToTmpSrcDir = path.join(os.tmpdir(), `project-copy-${Date.now()}`)
        fs.mkdirSync(pathToTmpSrcDir)
        changedFiles.forEach((file) => {
            const pathToTmpFile = path.join(pathToTmpSrcDir, file.oldFileName!.substring(2))
            // use mkdirsSync to create parent directories in pathToTmpFile too
            fs.mkdirSync(path.dirname(pathToTmpFile), { recursive: true })
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
    public parseDiff(
        pathToDiff: string,
        pathToWorkspace: string,
        diffDescription: PatchInfo | undefined,
        totalDiffPatches: number
    ): PatchFileNode {
        console.log('parsing ', pathToDiff)
        this.patchFileNodes = []
        const diffContents = fs.readFileSync(pathToDiff, 'utf8')

        if (!diffContents.trim()) {
            getLogger().error(`CodeTransformation: diff.patch file is empty`)
            throw new Error(CodeWhispererConstants.noChangesMadeMessage)
        }

        const changedFiles = parsePatch(diffContents)
        console.log('changed files: ', changedFiles)
        // path to the directory containing copy of the changed files in the transformed project
        const pathToTmpSrcDir = this.copyProject(pathToWorkspace, changedFiles)
        transformByQState.setProjectCopyFilePath(pathToTmpSrcDir)
        console.log('path to tmp src dir: ', pathToTmpSrcDir)

        applyPatches(changedFiles, {
            loadFile: function (fileObj, callback) {
                // load original contents of file
                const filePath = path.join(pathToWorkspace, fileObj.oldFileName!.substring(2))
                console.log(`loading filePath ${filePath}, exists = ${fs.existsSync(filePath)}`)
                if (!fs.existsSync(filePath)) {
                    // must be a new file (ex. summary.md), so pass empty string as original contents and do not pass error
                    callback(undefined, '')
                } else {
                    // must be a modified file (most common), so pass original contents
                    const fileContents = fs.readFileSync(filePath, 'utf-8')
                    console.log('original contents = ', fileContents)
                    callback(undefined, fileContents)
                }
            },
            // by now, 'content' contains the changes from the patch
            patched: function (fileObj, content, callback) {
                const filePath = path.join(pathToTmpSrcDir, fileObj.newFileName!.substring(2))
                console.log(`about to write ${content} to ${filePath}`)
                // write changed contents to the copy of the original file (or create a new file)
                fs.writeFileSync(filePath, content)
                callback(undefined)
            },
            complete: function (err) {
                console.log(`error = ${err}`)
                if (err) {
                    getLogger().error(`CodeTransformation: ${err} when applying patch`)
                } else {
                    getLogger().info('CodeTransformation: Patch applied successfully')
                }
            },
        })
        const patchFileNode = new PatchFileNode(diffDescription, pathToDiff)
        patchFileNode.label = `Patch ${this.currentPatchIndex + 1} of ${totalDiffPatches}: ${patchFileNode.label}`
        patchFileNode.children = changedFiles.flatMap((file) => {
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
        this.patchFileNodes.push(patchFileNode)
        return patchFileNode
    }

    public getChanges() {
        return this.patchFileNodes.flatMap((patchFileNode) => patchFileNode.children)
    }

    public getRoot() {
        return this.patchFileNodes.length > 0 ? this.patchFileNodes[0] : undefined
    }

    public saveChanges() {
        this.patchFileNodes.forEach((patchFileNode) => {
            patchFileNode.children.forEach((changeNode) => {
                changeNode.saveChange()
            })
        })
    }

    public rejectChanges() {
        this.clearChanges()
    }

    public clearChanges() {
        this.patchFileNodes = []
        this.currentPatchIndex = 0
    }
}

export class TransformationResultsProvider implements vscode.TreeDataProvider<ProposedChangeNode | PatchFileNode> {
    public static readonly viewType = 'aws.amazonq.transformationProposedChangesTree'

    private _onDidChangeTreeData: vscode.EventEmitter<any> = new vscode.EventEmitter<any>()
    readonly onDidChangeTreeData: vscode.Event<any> = this._onDidChangeTreeData.event

    constructor(private readonly model: DiffModel) {}

    public refresh(): any {
        this._onDidChangeTreeData.fire(undefined)
    }

    public getTreeItem(element: ProposedChangeNode | PatchFileNode): vscode.TreeItem {
        if (element instanceof PatchFileNode) {
            return {
                label: element.label,
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
            }
        } else {
            return {
                resourceUri: vscode.Uri.file(element.resourcePath),
                command: element.generateCommand(),
                description: element.generateDescription(),
            }
        }
    }

    /*
    Here we check if the element is a PatchFileNode instance. If it is, we return its 
    children array, which contains ProposedChangeNode instances. This ensures that when the user expands a 
    PatchFileNode (representing a diff.patch file), its children (proposed change nodes) are displayed as indented nodes under it.
    */
    public getChildren(
        element?: ProposedChangeNode | PatchFileNode
    ): (ProposedChangeNode | PatchFileNode)[] | Thenable<(ProposedChangeNode | PatchFileNode)[]> {
        if (!element) {
            return this.model.patchFileNodes
        } else if (element instanceof PatchFileNode) {
            return element.children
        } else {
            return Promise.resolve([])
        }
    }

    public getParent(element: ProposedChangeNode | PatchFileNode): PatchFileNode | undefined {
        if (element instanceof ProposedChangeNode) {
            const patchFileNode = this.model.patchFileNodes.find((p) => p.children.includes(element))
            return patchFileNode
        }
        return undefined
    }
}

export class ProposedTransformationExplorer {
    private changeViewer: vscode.TreeView<PatchFileNode>

    public static TmpDir = os.tmpdir()

    constructor(context: vscode.ExtensionContext) {
        const diffModel = new DiffModel()
        const transformDataProvider = new TransformationResultsProvider(diffModel)
        this.changeViewer = vscode.window.createTreeView(TransformationResultsProvider.viewType, {
            treeDataProvider: transformDataProvider,
        })

        const patchFiles: string[] = []
        let singlePatchFile: string = ''
        let patchFilesDescriptions: DescriptionContent | undefined = undefined

        const reset = async () => {
            await setContext('gumby.transformationProposalReviewInProgress', false)
            await setContext('gumby.reviewState', TransformByQReviewStatus.NotStarted)

            // delete result archive after changes cleared; summary is under ResultArchiveFilePath
            if (fs.existsSync(transformByQState.getResultArchiveFilePath())) {
                fs.rmSync(transformByQState.getResultArchiveFilePath(), { recursive: true, force: true })
            }
            if (fs.existsSync(transformByQState.getProjectCopyFilePath())) {
                fs.rmSync(transformByQState.getProjectCopyFilePath(), { recursive: true, force: true })
            }

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
            await setContext('gumby.transformationProposalReviewInProgress', true)
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
            await setContext('gumby.reviewState', TransformByQReviewStatus.PreparingReview)

            const pathToArchive = path.join(
                ProposedTransformationExplorer.TmpDir,
                transformByQState.getJobId(),
                'ExportResultsArchive.zip'
            )
            let exportResultsArchiveSize = 0
            let downloadErrorMessage = undefined

            const cwStreamingClient = await createCodeWhispererChatStreamingClient()
            try {
                await telemetry.codeTransform_downloadArtifact.run(async () => {
                    telemetry.record({
                        codeTransformArtifactType: 'ClientInstructions',
                        codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
                        codeTransformJobId: transformByQState.getJobId(),
                    })

                    await downloadExportResultArchive(
                        cwStreamingClient,
                        {
                            exportId: transformByQState.getJobId(),
                            exportIntent: ExportIntent.TRANSFORMATION,
                        },
                        pathToArchive
                    )

                    // Update downloaded artifact size
                    exportResultsArchiveSize = (await fs.promises.stat(pathToArchive)).size

                    telemetry.record({ codeTransformTotalByteSize: exportResultsArchiveSize })
                })
            } catch (e: any) {
                // user can retry the download
                downloadErrorMessage = (e as Error).message
                if (downloadErrorMessage.includes('Encountered an unexpected error when processing the request')) {
                    downloadErrorMessage = CodeWhispererConstants.errorDownloadingExpiredDiff
                }
                void vscode.window.showErrorMessage(
                    `${CodeWhispererConstants.errorDownloadingDiffNotification} The download failed due to: ${downloadErrorMessage}`
                )
                transformByQState.getChatControllers()?.transformationFinished.fire({
                    message: `${CodeWhispererConstants.errorDownloadingDiffChatMessage} The download failed due to: ${downloadErrorMessage}`,
                    tabID: ChatSessionManager.Instance.getSession().tabID,
                    includeStartNewTransformationButton: true,
                })
                await setContext('gumby.reviewState', TransformByQReviewStatus.NotStarted)
                getLogger().error(`CodeTransformation: ExportResultArchive error = ${downloadErrorMessage}`)
                throw new Error('Error downloading diff')
            } finally {
                cwStreamingClient.destroy()
            }

            let deserializeErrorMessage = undefined
            let pathContainingArchive = ''
            try {
                // Download and deserialize the zip
                pathContainingArchive = path.dirname(pathToArchive)
                const zip = new AdmZip(pathToArchive)
                zip.extractAllTo(pathContainingArchive)
                console.log('pathContainingArchive = ', pathContainingArchive)
                const files = fs.readdirSync(path.join(pathContainingArchive, ExportResultArchiveStructure.PathToPatch))
                files.forEach((file) => {
                    const filePath = path.join(pathContainingArchive, ExportResultArchiveStructure.PathToPatch, file)
                    if (file === 'diff.patch') {
                        singlePatchFile = filePath
                    } else if (file.endsWith('.json')) {
                        const jsonData = fs.readFileSync(filePath, 'utf-8')
                        patchFilesDescriptions = JSON.parse(jsonData)
                    }
                })
                if (patchFilesDescriptions !== undefined) {
                    for (const patchInfo of patchFilesDescriptions.content) {
                        patchFiles.push(
                            path.join(
                                pathContainingArchive,
                                ExportResultArchiveStructure.PathToPatch,
                                patchInfo.filename
                            )
                        )
                    }
                } else {
                    patchFiles.push(singlePatchFile)
                }
                //Because multiple patches are returned once the ZIP is downloaded, we want to show the first one to start
                diffModel.parseDiff(
                    patchFiles[0],
                    transformByQState.getProjectPath(),
                    patchFilesDescriptions ? patchFilesDescriptions.content[0] : undefined,
                    patchFiles.length
                )

                await setContext('gumby.reviewState', TransformByQReviewStatus.InReview)
                transformDataProvider.refresh()
                transformByQState.setSummaryFilePath(
                    path.join(pathContainingArchive, ExportResultArchiveStructure.PathToSummary)
                )
                transformByQState.setResultArchiveFilePath(pathContainingArchive)
                await setContext('gumby.isSummaryAvailable', true)

                // Do not await this so that the summary reveals without user needing to close this notification
                void vscode.window.showInformationMessage(CodeWhispererConstants.viewProposedChangesNotification)
                transformByQState.getChatControllers()?.transformationFinished.fire({
                    message: CodeWhispererConstants.viewProposedChangesChatMessage,
                    tabID: ChatSessionManager.Instance.getSession().tabID,
                    includeStartNewTransformationButton: true,
                })
                await vscode.commands.executeCommand('aws.amazonq.transformationHub.summary.reveal')
            } catch (e: any) {
                deserializeErrorMessage = (e as Error).message
                console.log('error parsing diff ', deserializeErrorMessage)
                getLogger().error(`CodeTransformation: ParseDiff error = ${deserializeErrorMessage}`)
                transformByQState.getChatControllers()?.transformationFinished.fire({
                    message: `${CodeWhispererConstants.errorDeserializingDiffChatMessage} ${deserializeErrorMessage}`,
                    tabID: ChatSessionManager.Instance.getSession().tabID,
                    includeStartNewTransformationButton: true,
                })
                void vscode.window.showErrorMessage(
                    `${CodeWhispererConstants.errorDeserializingDiffNotification} ${deserializeErrorMessage}`
                )
            }

            try {
                const metricsPath = path.join(pathContainingArchive, ExportResultArchiveStructure.PathToMetrics)
                const metricsData = JSON.parse(fs.readFileSync(metricsPath, 'utf8'))

                await codeWhisperer.codeWhispererClient.sendTelemetryEvent({
                    telemetryEvent: {
                        transformEvent: {
                            jobId: transformByQState.getJobId(),
                            timestamp: new Date(),
                            ideCategory: 'VSCODE',
                            programmingLanguage: {
                                languageName:
                                    transformByQState.getTransformationType() === TransformationType.LANGUAGE_UPGRADE
                                        ? 'JAVA'
                                        : 'SQL',
                            },
                            linesOfCodeChanged: metricsData.linesOfCodeChanged,
                            charsOfCodeChanged: metricsData.charactersOfCodeChanged,
                            linesOfCodeSubmitted: transformByQState.getLinesOfCodeSubmitted(), // currently unavailable for SQL conversions
                        },
                    },
                })
            } catch (err: any) {
                // log error, but continue to show user diff.patch with results
                getLogger().error(`CodeTransformation: SendTelemetryEvent error = ${err.message}`)
            }
        })

        vscode.commands.registerCommand('aws.amazonq.transformationHub.reviewChanges.acceptChanges', async () => {
            diffModel.saveChanges()
            telemetry.ui_click.emit({ elementId: 'transformationHub_acceptChanges' })
            if (transformByQState.getMultipleDiffs()) {
                void vscode.window.showInformationMessage(
                    CodeWhispererConstants.changesAppliedNotificationMultipleDiffs(
                        diffModel.currentPatchIndex,
                        patchFiles.length,
                        patchFilesDescriptions
                    )
                )
            } else {
                void vscode.window.showInformationMessage(CodeWhispererConstants.changesAppliedNotificationOneDiff)
            }

            //We do this to ensure that the changesAppliedChatMessage is only sent to user when they accept the first diff.patch
            if (transformByQState.getMultipleDiffs()) {
                if (diffModel.currentPatchIndex === patchFiles.length - 1) {
                    transformByQState.getChatControllers()?.transformationFinished.fire({
                        message: CodeWhispererConstants.changesAppliedChatMessageMultipleDiffs(
                            diffModel.currentPatchIndex,
                            patchFiles.length,
                            patchFilesDescriptions
                                ? patchFilesDescriptions.content[diffModel.currentPatchIndex].name
                                : undefined
                        ),
                        tabID: ChatSessionManager.Instance.getSession().tabID,
                        includeStartNewTransformationButton: true,
                    })
                } else {
                    transformByQState.getChatControllers()?.transformationFinished.fire({
                        message: CodeWhispererConstants.changesAppliedChatMessageMultipleDiffs(
                            diffModel.currentPatchIndex,
                            patchFiles.length,
                            patchFilesDescriptions
                                ? patchFilesDescriptions.content[diffModel.currentPatchIndex].name
                                : undefined
                        ),
                        tabID: ChatSessionManager.Instance.getSession().tabID,
                        includeStartNewTransformationButton: false,
                    })
                }
            } else {
                transformByQState.getChatControllers()?.transformationFinished.fire({
                    message: CodeWhispererConstants.changesAppliedChatMessageOneDiff,
                    tabID: ChatSessionManager.Instance.getSession().tabID,
                    includeStartNewTransformationButton: true,
                })
            }

            // Load the next patch file
            diffModel.currentPatchIndex++
            if (diffModel.currentPatchIndex < patchFiles.length) {
                const nextPatchFile = patchFiles[diffModel.currentPatchIndex]
                const nextPatchFileDescription = patchFilesDescriptions
                    ? patchFilesDescriptions.content[diffModel.currentPatchIndex]
                    : undefined
                diffModel.parseDiff(
                    nextPatchFile,
                    transformByQState.getProjectPath(),
                    nextPatchFileDescription,
                    patchFiles.length
                )
                transformDataProvider.refresh()
            } else {
                // All patches have been applied, reset the state
                await reset()
            }

            telemetry.codeTransform_viewArtifact.emit({
                codeTransformArtifactType: 'ClientInstructions',
                codeTransformVCSViewerSrcComponents: 'toastNotification',
                codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
                codeTransformJobId: transformByQState.getJobId(),
                codeTransformStatus: transformByQState.getStatus(),
                userChoice: 'Submit',
                result: MetadataResult.Pass,
            })
        })

        vscode.commands.registerCommand('aws.amazonq.transformationHub.reviewChanges.rejectChanges', async () => {
            diffModel.rejectChanges()
            await reset()
            telemetry.ui_click.emit({ elementId: 'transformationHub_rejectChanges' })

            transformByQState.getChatControllers()?.transformationFinished.fire({
                tabID: ChatSessionManager.Instance.getSession().tabID,
                includeStartNewTransformationButton: true,
            })

            telemetry.codeTransform_viewArtifact.emit({
                codeTransformArtifactType: 'ClientInstructions',
                codeTransformVCSViewerSrcComponents: 'toastNotification',
                codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
                codeTransformJobId: transformByQState.getJobId(),
                codeTransformStatus: transformByQState.getStatus(),
                userChoice: 'Cancel',
                result: MetadataResult.Pass,
            })
        })
    }
}
