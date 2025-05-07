/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { randomUUID } from 'crypto'
import * as vscode from 'vscode'
import { InlineDecorator } from '../decorations/inlineDecorator'
import { InlineChatProvider } from '../provider/inlineChatProvider'
import { InlineTask, TaskState, TextDiff } from './inlineTask'
import { responseTransformer } from '../output/responseTransformer'
import { adjustTextDiffForEditing, computeDiff } from '../output/computeDiff'
import { computeDecorations } from '../decorations/computeDecorations'
import { CodelensProvider } from '../codeLenses/codeLenseProvider'
import { PromptMessage, ReferenceLogController } from 'aws-core-vscode/codewhispererChat'
import { CodeWhispererSettings } from 'aws-core-vscode/codewhisperer'
import { UserWrittenCodeTracker } from 'aws-core-vscode/codewhisperer'
import { LanguageClient } from 'vscode-languageclient'
import {
    codicon,
    getIcon,
    getLogger,
    messages,
    setContext,
    Timeout,
    textDocumentUtil,
    isSageMaker,
    Experiments,
} from 'aws-core-vscode/shared'
import { InlineLineAnnotationController } from '../decorations/inlineLineAnnotationController'

export class InlineChatController {
    private task: InlineTask | undefined
    private readonly decorator = new InlineDecorator()
    private readonly inlineChatProvider: InlineChatProvider
    private readonly codeLenseProvider: CodelensProvider
    private readonly referenceLogController = new ReferenceLogController()
    private readonly inlineLineAnnotationController: InlineLineAnnotationController
    private readonly computeDiffAndRenderOnEditor: (query: string) => Promise<void>
    private userQuery: string | undefined
    private listeners: vscode.Disposable[] = []

    constructor(context: vscode.ExtensionContext, client: LanguageClient, encryptionKey: Buffer) {
        this.inlineChatProvider = new InlineChatProvider(client, encryptionKey)
        this.inlineChatProvider.onErrorOccured(() => this.handleError())
        this.codeLenseProvider = new CodelensProvider(context)
        this.inlineLineAnnotationController = new InlineLineAnnotationController(context)
        this.computeDiffAndRenderOnEditor = Experiments.instance.get('amazonqLSPInlineChat', false)
            ? this.computeDiffAndRenderOnEditorLSP.bind(this)
            : this.computeDiffAndRenderOnEditorLocal.bind(this)
    }

    public async createTask(
        query: string,
        document: vscode.TextDocument,
        selectionRange: vscode.Selection
    ): Promise<InlineTask> {
        const inlineTask = new InlineTask(query, document, selectionRange)
        return inlineTask
    }

    public async acceptAllChanges(task = this.task, userInvoked: boolean): Promise<void> {
        if (!task) {
            return
        }
        const editor = vscode.window.visibleTextEditors.find(
            (editor) => editor.document.uri.toString() === task.document.uri.toString()
        )
        if (!editor) {
            return
        }
        if (userInvoked) {
            this.inlineChatProvider.sendTelemetryEvent(
                {
                    userDecision: 'ACCEPT',
                },
                this.task
            )
        }
        const deletions = task.diff.filter((diff) => diff.type === 'deletion')
        await editor.edit(
            (editBuilder) => {
                for (const deletion of deletions) {
                    editBuilder.delete(deletion.range)
                }
            },
            { undoStopAfter: false, undoStopBefore: false }
        )
        task.diff = []
        task.updateDecorations()
        this.decorator.applyDecorations(task)
        await this.updateTaskAndLenses(task)
        this.referenceLogController.addReferenceLog(task.codeReferences, task.replacement ? task.replacement : '')
        await this.reset()
        UserWrittenCodeTracker.instance.onQFinishesEdits()
    }

    public async rejectAllChanges(task = this.task, userInvoked: boolean): Promise<void> {
        if (!task) {
            return
        }
        const editor = vscode.window.visibleTextEditors.find(
            (editor) => editor.document.uri.toString() === task.document.uri.toString()
        )
        if (!editor) {
            return
        }
        if (userInvoked) {
            this.inlineChatProvider.sendTelemetryEvent(
                {
                    userDecision: 'REJECT',
                },
                this.task
            )
        }
        const insertions = task.diff.filter((diff) => diff.type === 'insertion')
        await editor.edit(
            (editBuilder) => {
                for (const insertion of insertions) {
                    editBuilder.delete(insertion.range)
                }
            },
            { undoStopAfter: false, undoStopBefore: false }
        )
        task.diff = []
        task.updateDecorations()
        this.decorator.applyDecorations(task)
        await this.updateTaskAndLenses(task)
        this.referenceLogController.addReferenceLog(task.codeReferences, task.replacement ? task.replacement : '')
        await this.reset()
    }

    public async updateTaskAndLenses(task?: InlineTask, taskState?: TaskState) {
        if (!task) {
            return
        }
        if (taskState) {
            task.state = taskState
        } else if (!task.diff || task.diff.length === 0) {
            // If the previous state was waiting for a decision and the code diff is clean, then we mark the task as completed
            if (task.state === TaskState.WaitingForDecision) {
                task.state = TaskState.Complete
            }
        }
        this.codeLenseProvider.updateLenses(task)
        if (task.state === TaskState.InProgress) {
            if (vscode.window.activeTextEditor) {
                await this.inlineLineAnnotationController.hide(vscode.window.activeTextEditor)
            }
        }
        await this.refreshCodeLenses(task)
        if (task.state === TaskState.Complete) {
            await this.reset()
        }
    }

    private async handleError() {
        if (!this.task) {
            return
        }
        this.task.state = TaskState.Error
        this.codeLenseProvider.updateLenses(this.task)
        await this.refreshCodeLenses(this.task)
        await this.reset()
    }

    private async reset() {
        for (const listener of this.listeners) {
            listener.dispose()
        }
        this.listeners = []

        this.task = undefined
        this.inlineLineAnnotationController.enable()
        await setContext('amazonq.inline.codelensShortcutEnabled', undefined)
    }

    private async refreshCodeLenses(task: InlineTask): Promise<void> {
        await vscode.commands.executeCommand('vscode.executeCodeLensProvider', task.document.uri)
    }

    public async inlineQuickPick(previouseQuery?: string) {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return
        }

        if (isSageMaker()) {
            void vscode.window.showWarningMessage('Amazon Q: Inline chat is not supported in Sagemaker')
            return
        }

        if (this.task && this.task.isActiveState()) {
            void vscode.window.showWarningMessage(
                'Amazon Q: Reject or Accept the current suggestion before creating a new one'
            )
            return
        }

        await vscode.window
            .showInputBox({
                value: previouseQuery ?? '',
                placeHolder: 'Enter instructions for Q',
                prompt: codicon`${getIcon('aws-amazonq-q-white')} Edit code`,
            })
            .then(async (query) => {
                if (!query || query.trim() === '') {
                    getLogger().info('inlineQuickPick query is empty')
                    return
                }
                UserWrittenCodeTracker.instance.onQStartsMakingEdits()
                this.userQuery = query
                await textDocumentUtil.addEofNewline(editor)
                this.task = await this.createTask(query, editor.document, editor.selection)
                await this.inlineLineAnnotationController.disable(editor)
                await this.computeDiffAndRenderOnEditor(query).catch(async (err) => {
                    getLogger().error('computeDiffAndRenderOnEditor error: %s', (err as Error)?.message)
                    if (err instanceof Error) {
                        void vscode.window.showErrorMessage(`Amazon Q: ${err.message}`)
                    } else {
                        void vscode.window.showErrorMessage('Amazon Q encountered an error')
                    }
                    await this.handleError()
                })
            })
    }

    private async computeDiffAndRenderOnEditorLSP(query: string) {
        if (!this.task) {
            return
        }

        await this.updateTaskAndLenses(this.task, TaskState.InProgress)
        getLogger().info(`inline chat query:\n${query}`)
        const uuid = randomUUID()
        const message: PromptMessage = {
            message: query,
            messageId: uuid,
            command: undefined,
            userIntent: undefined,
            tabID: uuid,
        }

        const response = await this.inlineChatProvider.processPromptMessageLSP(message)

        // TODO: add tests for this case.
        if (!response.body) {
            getLogger().warn('Empty body in inline chat response')
            await this.handleError()
            return
        }

        // Update inline diff view
        const textDiff = computeDiff(response.body, this.task, false)
        const decorations = computeDecorations(this.task)
        this.task.decorations = decorations
        await this.applyDiff(this.task, textDiff ?? [])
        this.decorator.applyDecorations(this.task)

        // Update Codelenses
        await this.updateTaskAndLenses(this.task, TaskState.WaitingForDecision)
        await setContext('amazonq.inline.codelensShortcutEnabled', true)
        this.undoListener(this.task)
    }

    // TODO: remove this implementation in favor of LSP
    private async computeDiffAndRenderOnEditorLocal(query: string) {
        if (!this.task) {
            return
        }

        await this.updateTaskAndLenses(this.task, TaskState.InProgress)
        getLogger().info(`inline chat query:\n${query}`)
        const uuid = randomUUID()
        const message: PromptMessage = {
            message: query,
            messageId: uuid,
            command: undefined,
            userIntent: undefined,
            tabID: uuid,
        }

        const requestStart = performance.now()
        let responseStartLatency: number | undefined

        const response = await this.inlineChatProvider.processPromptMessage(message)
        this.task.requestId = response?.$metadata.requestId

        // Deselect all code
        const editor = vscode.window.activeTextEditor
        if (editor) {
            const selection = editor.selection
            if (!selection.isEmpty) {
                const cursor = selection.active
                const newSelection = new vscode.Selection(cursor, cursor)
                editor.selection = newSelection
            }
        }

        if (response) {
            let qSuggestedCodeResponse = ''
            for await (const chatEvent of response.generateAssistantResponseResponse!) {
                if (
                    chatEvent.assistantResponseEvent?.content !== undefined &&
                    chatEvent.assistantResponseEvent.content.length > 0
                ) {
                    if (responseStartLatency === undefined) {
                        responseStartLatency = performance.now() - requestStart
                    }

                    qSuggestedCodeResponse += chatEvent.assistantResponseEvent.content

                    const transformedResponse = responseTransformer(qSuggestedCodeResponse, this.task, false)
                    if (transformedResponse) {
                        const textDiff = computeDiff(transformedResponse, this.task, true)
                        const decorations = computeDecorations(this.task)
                        this.task.decorations = decorations
                        await this.applyDiff(this.task!, textDiff ?? [], {
                            undoStopBefore: false,
                            undoStopAfter: false,
                        })
                        this.decorator.applyDecorations(this.task)
                        this.task.previouseDiff = textDiff
                    }
                }
                if (
                    chatEvent.codeReferenceEvent?.references !== undefined &&
                    chatEvent.codeReferenceEvent.references.length > 0
                ) {
                    this.task.codeReferences = this.task.codeReferences.concat(chatEvent.codeReferenceEvent?.references)
                    // clear diff if user settings is off for code reference
                    if (!CodeWhispererSettings.instance.isSuggestionsWithCodeReferencesEnabled()) {
                        await this.rejectAllChanges(this.task, false)
                        void vscode.window.showInformationMessage(
                            'Your settings do not allow code generation with references.'
                        )
                        await this.updateTaskAndLenses(this.task, TaskState.Complete)
                        return
                    }
                }
                if (chatEvent.error) {
                    getLogger().error('generateAssistantResponse stream error: %s', chatEvent.error)
                    await this.rejectAllChanges(this.task, false)
                    void vscode.window.showErrorMessage(`Amazon Q: ${chatEvent.error.message}`)
                    await this.updateTaskAndLenses(this.task, TaskState.Complete)
                    return
                }
            }

            if (this.task) {
                // Unclear why we need to check if task is defined, but occasionally an error occurs otherwise
                this.task.responseStartLatency = responseStartLatency
                this.task.responseEndLatency = performance.now() - requestStart
            }
            getLogger().info(`qSuggestedCodeResponse:\n${qSuggestedCodeResponse}`)
            const transformedResponse = responseTransformer(qSuggestedCodeResponse, this.task, true)
            if (transformedResponse) {
                const textDiff = computeDiff(transformedResponse, this.task, false)
                const decorations = computeDecorations(this.task)
                this.task.decorations = decorations
                await this.applyDiff(this.task, textDiff ?? [])
                this.decorator.applyDecorations(this.task)
                await this.updateTaskAndLenses(this.task, TaskState.WaitingForDecision)
                await setContext('amazonq.inline.codelensShortcutEnabled', true)
                this.undoListener(this.task)
            } else {
                void messages.showMessageWithCancel(
                    'No suggestions from Q, please try different instructions.',
                    new Timeout(5000)
                )
                await this.updateTaskAndLenses(this.task, TaskState.Complete)
                await this.inlineQuickPick(this.userQuery)
                await this.handleError()
            }
        }
    }

    private async applyDiff(
        task: InlineTask,
        textDiff: TextDiff[],
        undoOption?: { undoStopBefore: boolean; undoStopAfter: boolean }
    ) {
        const adjustedTextDiff = adjustTextDiffForEditing(textDiff)
        const visibleEditor = vscode.window.visibleTextEditors.find(
            (editor) => editor.document.uri === task.document.uri
        )
        const previousDiff = task.previouseDiff?.filter((diff) => diff.type === 'insertion')

        if (visibleEditor) {
            if (previousDiff) {
                await visibleEditor.edit(
                    (editBuilder) => {
                        for (const insertion of previousDiff) {
                            editBuilder.delete(insertion.range)
                        }
                    },
                    { undoStopAfter: false, undoStopBefore: false }
                )
            }
            await visibleEditor.edit(
                (editBuilder) => {
                    for (const change of adjustedTextDiff) {
                        if (change.type === 'insertion') {
                            editBuilder.insert(change.range.start, change.replacementText)
                        }
                    }
                },
                undoOption ?? { undoStopBefore: true, undoStopAfter: false }
            )
        } else {
            if (previousDiff) {
                const edit = new vscode.WorkspaceEdit()
                for (const insertion of previousDiff) {
                    edit.delete(task.document.uri, insertion.range)
                }
                await vscode.workspace.applyEdit(edit)
            }
            const edit = new vscode.WorkspaceEdit()
            for (const change of textDiff) {
                if (change.type === 'insertion') {
                    edit.insert(task.document.uri, change.range.start, change.replacementText)
                }
            }
            await vscode.workspace.applyEdit(edit)
        }
    }

    private undoListener(task: InlineTask) {
        const listener: vscode.Disposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
            const { document, contentChanges } = event

            if (document.uri.toString() !== task.document.uri.toString()) {
                return
            }

            const changeIntersectsRange = contentChanges.some((change) => {
                const { range } = change
                if (task.selectedRange) {
                    return !(
                        range.end.isBefore(task.selectedRange.start) || range.start.isAfter(task.selectedRange.end)
                    )
                }
            })

            if (!changeIntersectsRange) {
                return
            }

            const updatedSelectedText = document.getText(task.selectedRange)

            if (updatedSelectedText.trim() === task.selectedText.trim()) {
                task.diff = []
                await this.updateTaskAndLenses(task)
                task.updateDecorations()
                this.decorator.applyDecorations(task)
                listener.dispose()
            }
        })

        this.listeners.push(listener)
    }
}
