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
import { TransformByQReviewStatus, transformByQState, TransformationType } from '../../models/model'
import { ExportResultArchiveStructure, downloadExportResultArchive } from '../../../shared/utilities/download'
import { getLogger } from '../../../shared/logger/logger'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { CodeTransformTelemetryState } from '../../../amazonqGumby/telemetry/codeTransformTelemetryState'
import * as CodeWhispererConstants from '../../models/constants'
import { createCodeWhispererChatStreamingClient } from '../../../shared/clients/codewhispererChatClient'
import { ChatSessionManager } from '../../../amazonqGumby/chat/storages/chatSession'
import { setContext } from '../../../shared/vscode/setContext'
import * as codeWhisperer from '../../client/codewhisperer'
import { UserWrittenCodeTracker } from '../../tracker/userWrittenCodeTracker'
import { AuthUtil } from '../../util/authUtil'

export abstract class ProposedChangeNode {
    abstract readonly resourcePath: string

    abstract generateCommand(): vscode.Command
    abstract generateDescription(): string
    abstract saveFile(): void

    public saveChange(): void {
        try {
            this.saveFile()
        } catch (err) {
            // to do: file system-related error handling
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

    constructor(patchFilePath: string) {
        this.patchFilePath = patchFilePath
        this.label = path.basename(patchFilePath)
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
        for (const file of changedFiles) {
            const pathToTmpFile = path.join(pathToTmpSrcDir, file.oldFileName!.substring(2))
            // use mkdirsSync to create parent directories in pathToTmpFile too
            fs.mkdirSync(path.dirname(pathToTmpFile), { recursive: true })
            const pathToOldFile = path.join(pathToWorkspace, file.oldFileName!.substring(2))
            // pathToOldFile will not exist for new files such as summary.md
            if (fs.existsSync(pathToOldFile)) {
                fs.copyFileSync(pathToOldFile, pathToTmpFile)
            }
        }
        return pathToTmpSrcDir
    }

    /**
     * @param pathToDiff Path to the diff.patch file expected to be located in the archive returned by ExportResultsArchive
     * @param pathToWorkspace Path to the project that was transformed
     * @returns List of nodes containing the paths of files that were modified, added, or removed
     */
    public parseDiff(pathToDiff: string, pathToWorkspace: string, isIntermediateBuild: boolean = false): PatchFileNode {
        this.patchFileNodes = []
        const diffContents = fs.readFileSync(pathToDiff, 'utf8')

        if (!diffContents.trim()) {
            getLogger().error(`CodeTransformation: diff.patch file is empty`)
            throw new Error(CodeWhispererConstants.noChangesMadeMessage)
        }

        let changedFiles = parsePatch(diffContents)
        // exclude dependency_upgrade.yml from patch application
        changedFiles = changedFiles.filter((file) => !file.oldFileName?.includes('dependency_upgrade'))
        getLogger().info('CodeTransformation: parsed patch file successfully')
        // if doing intermediate client-side build, pathToWorkspace is the path to the unzipped project's 'sources' directory (re-using upload ZIP)
        // otherwise, we are at the very end of the transformation and need to copy the changed files in the project to show the diff(s)
        const pathToTmpSrcDir = isIntermediateBuild ? pathToWorkspace : this.copyProject(pathToWorkspace, changedFiles)
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
        const patchFileNode = new PatchFileNode(pathToDiff)
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
        for (const patchFileNode of this.patchFileNodes) {
            for (const changeNode of patchFileNode.children) {
                changeNode.saveChange()
            }
        }
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

        let patchFiles: string[] = []
        let singlePatchFile: string = ''

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
            // update summary path to where it is locally after user accepts changes, so that View Summary button works
            transformByQState.setSummaryFilePath(
                path.join(transformByQState.getProjectPath(), ExportResultArchiveStructure.PathToSummary)
            )
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
            if (fs.existsSync(transformByQState.getSummaryFilePath())) {
                await vscode.commands.executeCommand(
                    'markdown.showPreview',
                    vscode.Uri.file(transformByQState.getSummaryFilePath())
                )
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
                        pathToArchive,
                        AuthUtil.instance.regionProfileManager.activeRegionProfile
                    )

                    getLogger().info('CodeTransformation: downloaded results successfully')
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
                })
                await setContext('gumby.reviewState', TransformByQReviewStatus.NotStarted)
                getLogger().error(`CodeTransformation: ExportResultArchive error = ${downloadErrorMessage}`)
                throw new Error('Error downloading diff')
            } finally {
                cwStreamingClient.destroy()
                UserWrittenCodeTracker.instance.onQFeatureInvoked()
            }

            let deserializeErrorMessage = undefined
            let pathContainingArchive = ''
            patchFiles = [] // reset patchFiles if there was a previous transformation
            try {
                // Download and deserialize the zip
                pathContainingArchive = path.dirname(pathToArchive)
                const zip = new AdmZip(pathToArchive)
                zip.extractAllTo(pathContainingArchive)
                const files = fs.readdirSync(path.join(pathContainingArchive, ExportResultArchiveStructure.PathToPatch))
                singlePatchFile = path.join(pathContainingArchive, ExportResultArchiveStructure.PathToPatch, files[0])
                patchFiles.push(singlePatchFile)
                diffModel.parseDiff(patchFiles[0], transformByQState.getProjectPath())

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
                })
                await vscode.commands.executeCommand('aws.amazonq.transformationHub.summary.reveal')
            } catch (e: any) {
                deserializeErrorMessage = (e as Error).message
                getLogger().error(`CodeTransformation: ParseDiff error = ${deserializeErrorMessage}`)
                transformByQState.getChatControllers()?.transformationFinished.fire({
                    message: `${CodeWhispererConstants.errorDeserializingDiffChatMessage} ${deserializeErrorMessage}`,
                    tabID: ChatSessionManager.Instance.getSession().tabID,
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
                                        ? 'java'
                                        : 'sql',
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
            telemetry.codeTransform_submitSelection.run(() => {
                getLogger().info('CodeTransformation: accepted changes')
                diffModel.saveChanges()
                telemetry.record({
                    codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
                    codeTransformJobId: transformByQState.getJobId(),
                    userChoice: 'acceptChanges',
                })
            })
            void vscode.window.showInformationMessage(CodeWhispererConstants.changesAppliedNotificationOneDiff)
            transformByQState.getChatControllers()?.transformationFinished.fire({
                message: CodeWhispererConstants.changesAppliedChatMessageOneDiff,
                tabID: ChatSessionManager.Instance.getSession().tabID,
            })
            // reset after applying the patch
            await reset()
        })

        vscode.commands.registerCommand('aws.amazonq.transformationHub.reviewChanges.rejectChanges', async () => {
            await telemetry.codeTransform_submitSelection.run(async () => {
                getLogger().info('CodeTransformation: rejected changes')
                diffModel.rejectChanges()
                await reset()
                telemetry.record({
                    codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
                    codeTransformJobId: transformByQState.getJobId(),
                    userChoice: 'rejectChanges',
                })
            })
            transformByQState.getChatControllers()?.transformationFinished.fire({
                tabID: ChatSessionManager.Instance.getSession().tabID,
            })
        })
    }
}
