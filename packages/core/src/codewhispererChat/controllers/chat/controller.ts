/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as path from 'path'
import { Event as VSCodeEvent, Uri, workspace, window, ViewColumn, Position, Selection } from 'vscode'
import { EditorContextExtractor } from '../../editor/context/extractor'
import { ChatSessionStorage } from '../../storages/chatSession'
import { Messenger, MessengerResponseType, StaticTextResponseType } from './messenger/messenger'
import {
    PromptMessage,
    ChatTriggerType,
    TriggerPayload,
    TabClosedMessage,
    InsertCodeAtCursorPosition,
    TriggerTabIDReceived,
    StopResponseMessage,
    CopyCodeToClipboard,
    ChatItemVotedMessage,
    ChatItemFeedbackMessage,
    TabCreatedMessage,
    TabChangedMessage,
    UIFocusMessage,
    SourceLinkClickMessage,
    ResponseBodyLinkClickMessage,
    ChatPromptCommandType,
    FooterInfoLinkClick,
    ViewDiff,
    AcceptDiff,
    QuickCommandGroupActionClick,
    MergedRelevantDocument,
    FileClick,
    RelevantTextDocumentAddition,
} from './model'
import {
    AppToWebViewMessageDispatcher,
    ContextSelectedMessage,
    CustomFormActionMessage,
} from '../../view/connector/connector'
import { MessagePublisher } from '../../../amazonq/messages/messagePublisher'
import { MessageListener } from '../../../amazonq/messages/messageListener'
import { EditorContentController } from '../../../amazonq/commons/controllers/contentController'
import { EditorContextCommand } from '../../commands/registerCommands'
import { PromptsGenerator } from './prompts/promptsGenerator'
import { TriggerEventsStorage } from '../../storages/triggerEvents'
import { SendMessageRequest } from '@amzn/amazon-q-developer-streaming-client'
import { CodeWhispererStreamingServiceException } from '@amzn/codewhisperer-streaming'
import { UserIntentRecognizer } from './userIntent/userIntentRecognizer'
import { CWCTelemetryHelper, recordTelemetryChatRunCommand } from './telemetryHelper'
import { CodeWhispererTracker } from '../../../codewhisperer/tracker/codewhispererTracker'
import { getLogger } from '../../../shared/logger/logger'
import { triggerPayloadToChatRequest } from './chatRequest/converter'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'
import { openUrl } from '../../../shared/utilities/vsCodeUtils'
import { randomUUID } from '../../../shared/crypto'
import { LspController } from '../../../amazonq/lsp/lspController'
import { CodeWhispererSettings } from '../../../codewhisperer/util/codewhispererSettings'
import { getSelectedCustomization } from '../../../codewhisperer/util/customizationUtil'
import { getHttpStatusCode, AwsClientResponseError } from '../../../shared/errors'
import { uiEventRecorder } from '../../../amazonq/util/eventRecorder'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { isSsoConnection } from '../../../auth/connection'
import { inspect } from '../../../shared/utilities/collectionUtils'
import { DefaultAmazonQAppInitContext } from '../../../amazonq/apps/initContext'
import globals from '../../../shared/extensionGlobals'
import { MynahIconsType, MynahUIDataModel, QuickActionCommand } from '@aws/mynah-ui'
import { LspClient } from '../../../amazonq/lsp/lspClient'
import { ContextCommandItem } from '../../../amazonq/lsp/types'
import { createPromptCommand, workspaceCommand } from '../../../amazonq/webview/ui/tabs/constants'
import fs from '../../../shared/fs/fs'
import * as vscode from 'vscode'
import { FeatureConfigProvider, Features } from '../../../shared/featureConfig'

export interface ChatControllerMessagePublishers {
    readonly processPromptChatMessage: MessagePublisher<PromptMessage>
    readonly processTabCreatedMessage: MessagePublisher<TabCreatedMessage>
    readonly processTabClosedMessage: MessagePublisher<TabClosedMessage>
    readonly processTabChangedMessage: MessagePublisher<TabChangedMessage>
    readonly processInsertCodeAtCursorPosition: MessagePublisher<InsertCodeAtCursorPosition>
    readonly processAcceptDiff: MessagePublisher<AcceptDiff>
    readonly processViewDiff: MessagePublisher<ViewDiff>
    readonly processCopyCodeToClipboard: MessagePublisher<CopyCodeToClipboard>
    readonly processContextMenuCommand: MessagePublisher<EditorContextCommand>
    readonly processTriggerTabIDReceived: MessagePublisher<TriggerTabIDReceived>
    readonly processStopResponseMessage: MessagePublisher<StopResponseMessage>
    readonly processChatItemVotedMessage: MessagePublisher<ChatItemVotedMessage>
    readonly processChatItemFeedbackMessage: MessagePublisher<ChatItemFeedbackMessage>
    readonly processUIFocusMessage: MessagePublisher<UIFocusMessage>
    readonly processSourceLinkClick: MessagePublisher<SourceLinkClickMessage>
    readonly processResponseBodyLinkClick: MessagePublisher<ResponseBodyLinkClickMessage>
    readonly processFooterInfoLinkClick: MessagePublisher<FooterInfoLinkClick>
    readonly processContextCommandUpdateMessage: MessagePublisher<void>
    readonly processQuickCommandGroupActionClicked: MessagePublisher<QuickCommandGroupActionClick>
    readonly processCustomFormAction: MessagePublisher<CustomFormActionMessage>
    readonly processContextSelected: MessagePublisher<ContextSelectedMessage>
    readonly processFileClick: MessagePublisher<FileClick>
}

export interface ChatControllerMessageListeners {
    readonly processPromptChatMessage: MessageListener<PromptMessage>
    readonly processTabCreatedMessage: MessageListener<TabCreatedMessage>
    readonly processTabClosedMessage: MessageListener<TabClosedMessage>
    readonly processTabChangedMessage: MessageListener<TabChangedMessage>
    readonly processInsertCodeAtCursorPosition: MessageListener<InsertCodeAtCursorPosition>
    readonly processAcceptDiff: MessageListener<AcceptDiff>
    readonly processViewDiff: MessageListener<ViewDiff>
    readonly processCopyCodeToClipboard: MessageListener<CopyCodeToClipboard>
    readonly processContextMenuCommand: MessageListener<EditorContextCommand>
    readonly processTriggerTabIDReceived: MessageListener<TriggerTabIDReceived>
    readonly processStopResponseMessage: MessageListener<StopResponseMessage>
    readonly processChatItemVotedMessage: MessageListener<ChatItemVotedMessage>
    readonly processChatItemFeedbackMessage: MessageListener<ChatItemFeedbackMessage>
    readonly processUIFocusMessage: MessageListener<UIFocusMessage>
    readonly processSourceLinkClick: MessageListener<SourceLinkClickMessage>
    readonly processResponseBodyLinkClick: MessageListener<ResponseBodyLinkClickMessage>
    readonly processFooterInfoLinkClick: MessageListener<FooterInfoLinkClick>
    readonly processContextCommandUpdateMessage: MessageListener<void>
    readonly processQuickCommandGroupActionClicked: MessageListener<QuickCommandGroupActionClick>
    readonly processCustomFormAction: MessageListener<CustomFormActionMessage>
    readonly processContextSelected: MessageListener<ContextSelectedMessage>
    readonly processFileClick: MessageListener<FileClick>
}

const promptFileExtension = '.prompt'

const additionalContentInnerContextLimit = 8192

const aditionalContentNameLimit = 1024

export class ChatController {
    private readonly sessionStorage: ChatSessionStorage
    private readonly triggerEventsStorage: TriggerEventsStorage
    private readonly messenger: Messenger
    private readonly editorContextExtractor: EditorContextExtractor
    private readonly editorContentController: EditorContentController
    private readonly promptGenerator: PromptsGenerator
    private readonly userIntentRecognizer: UserIntentRecognizer
    private readonly telemetryHelper: CWCTelemetryHelper

    public constructor(
        private readonly chatControllerMessageListeners: ChatControllerMessageListeners,
        appsToWebViewMessagePublisher: MessagePublisher<any>,
        onDidChangeAmazonQVisibility: VSCodeEvent<boolean>
    ) {
        this.sessionStorage = new ChatSessionStorage()
        this.triggerEventsStorage = new TriggerEventsStorage()
        this.telemetryHelper = CWCTelemetryHelper.init(this.sessionStorage, this.triggerEventsStorage)
        this.messenger = new Messenger(
            new AppToWebViewMessageDispatcher(appsToWebViewMessagePublisher),
            this.telemetryHelper
        )
        this.editorContextExtractor = new EditorContextExtractor()
        this.editorContentController = new EditorContentController()
        this.promptGenerator = new PromptsGenerator()
        this.userIntentRecognizer = new UserIntentRecognizer()

        onDidChangeAmazonQVisibility((visible) => {
            if (visible) {
                this.telemetryHelper.recordOpenChat()
            } else {
                this.telemetryHelper.recordCloseChat()
            }
        })

        this.chatControllerMessageListeners.processPromptChatMessage.onMessage((data) => {
            const uiEvents = uiEventRecorder.get(data.tabID)
            if (uiEvents) {
                uiEventRecorder.set(data.tabID, {
                    events: {
                        featureReceivedMessage: globals.clock.Date.now(),
                    },
                })
            }
            /**
             * traceId is only instrumented for chat-prompt but not for things
             * like follow-up-was-clicked. In those cases we fallback to a different
             * uuid
             **/
            return telemetry.withTraceId(() => {
                return this.processPromptChatMessage(data)
            }, uiEvents?.traceId ?? randomUUID())
        })

        this.chatControllerMessageListeners.processTabCreatedMessage.onMessage((data) => {
            return this.processTabCreateMessage(data)
        })

        this.chatControllerMessageListeners.processTabClosedMessage.onMessage((data) => {
            return this.processTabCloseMessage(data)
        })

        this.chatControllerMessageListeners.processTabChangedMessage.onMessage((data) => {
            return this.processTabChangedMessage(data)
        })

        this.chatControllerMessageListeners.processInsertCodeAtCursorPosition.onMessage((data) => {
            return this.processInsertCodeAtCursorPosition(data)
        })

        this.chatControllerMessageListeners.processAcceptDiff.onMessage((data) => {
            return this.processAcceptDiff(data)
        })

        this.chatControllerMessageListeners.processViewDiff.onMessage((data) => {
            return this.processViewDiff(data)
        })

        this.chatControllerMessageListeners.processCopyCodeToClipboard.onMessage((data) => {
            return this.processCopyCodeToClipboard(data)
        })

        this.chatControllerMessageListeners.processContextMenuCommand.onMessage((data) => {
            return this.processContextMenuCommand(data)
        })

        this.chatControllerMessageListeners.processTriggerTabIDReceived.onMessage((data) => {
            return this.processTriggerTabIDReceived(data)
        })

        this.chatControllerMessageListeners.processStopResponseMessage.onMessage((data) => {
            return this.processStopResponseMessage(data)
        })

        this.chatControllerMessageListeners.processChatItemVotedMessage.onMessage((data) => {
            return this.processChatItemVotedMessage(data)
        })

        this.chatControllerMessageListeners.processChatItemFeedbackMessage.onMessage((data) => {
            return this.processChatItemFeedbackMessage(data)
        })

        this.chatControllerMessageListeners.processUIFocusMessage.onMessage((data) => {
            return this.processUIFocusMessage(data)
        })

        this.chatControllerMessageListeners.processSourceLinkClick.onMessage((data) => {
            return this.processSourceLinkClick(data)
        })
        this.chatControllerMessageListeners.processResponseBodyLinkClick.onMessage((data) => {
            return this.processResponseBodyLinkClick(data)
        })
        this.chatControllerMessageListeners.processFooterInfoLinkClick.onMessage((data) => {
            return this.processFooterInfoLinkClick(data)
        })
        this.chatControllerMessageListeners.processContextCommandUpdateMessage.onMessage(() => {
            return this.processContextCommandUpdateMessage()
        })
        this.chatControllerMessageListeners.processQuickCommandGroupActionClicked.onMessage((data) => {
            return this.processQuickCommandGroupActionClicked(data)
        })
        this.chatControllerMessageListeners.processCustomFormAction.onMessage((data) => {
            return this.processCustomFormAction(data)
        })
        this.chatControllerMessageListeners.processContextSelected.onMessage((data) => {
            return this.processContextSelected(data)
        })
        this.chatControllerMessageListeners.processFileClick.onMessage((data) => {
            return this.processFileClickMessage(data)
        })
    }

    private processFooterInfoLinkClick(click: FooterInfoLinkClick) {
        this.openLinkInExternalBrowser(click)
    }

    private openLinkInExternalBrowser(
        click: ResponseBodyLinkClickMessage | SourceLinkClickMessage | FooterInfoLinkClick
    ) {
        this.telemetryHelper.recordInteractWithMessage(click)
        void openUrl(Uri.parse(click.link))
    }

    private processResponseBodyLinkClick(click: ResponseBodyLinkClickMessage) {
        this.openLinkInExternalBrowser(click)
    }

    private processSourceLinkClick(click: SourceLinkClickMessage) {
        this.openLinkInExternalBrowser(click)
    }

    private processQuickActionCommand(message: PromptMessage) {
        this.editorContextExtractor
            .extractContextForTrigger('QuickAction')
            .then((context) => {
                const triggerID = randomUUID()

                const quickActionCommand = message.command as ChatPromptCommandType

                this.messenger.sendQuickActionMessage(quickActionCommand, triggerID)

                this.triggerEventsStorage.addTriggerEvent({
                    id: triggerID,
                    tabID: message.tabID,
                    message: undefined,
                    type: 'quick_action',
                    quickAction: quickActionCommand,
                    context,
                })

                if (quickActionCommand === 'help') {
                    void this.generateStaticTextResponse('quick-action-help', triggerID)
                    recordTelemetryChatRunCommand('help')
                    return
                }
            })
            .catch((e) => {
                this.processException(e, '')
            })
    }

    private async processChatItemFeedbackMessage(message: ChatItemFeedbackMessage) {
        await this.telemetryHelper.recordFeedback(message)
    }

    private async processChatItemVotedMessage(message: ChatItemVotedMessage) {
        this.telemetryHelper.recordInteractWithMessage(message)
    }

    private async processStopResponseMessage(message: StopResponseMessage) {
        const session = this.sessionStorage.getSession(message.tabID)
        session.tokenSource.cancel()
    }

    private async processTriggerTabIDReceived(message: TriggerTabIDReceived) {
        this.triggerEventsStorage.updateTriggerEventTabIDFromUnknown(message.triggerID, message.tabID)
    }

    private async processInsertCodeAtCursorPosition(message: InsertCodeAtCursorPosition) {
        this.editorContentController.insertTextAtCursorPosition(message.code, (editor, cursorStart) => {
            CodeWhispererTracker.getTracker().enqueue({
                conversationID: this.telemetryHelper.getConversationId(message.tabID) ?? '',
                messageID: message.messageId,
                userIntent: message.userIntent,
                time: new Date(),
                fileUrl: editor.document.uri,
                startPosition: cursorStart,
                endPosition: editor.selection.active,
                originalString: message.code,
            })
        })
        this.telemetryHelper.recordInteractWithMessage(message)
    }

    private async processAcceptDiff(message: AcceptDiff) {
        const context = this.triggerEventsStorage.getTriggerEvent((message.data as any)?.triggerID) || ''
        this.editorContentController
            .acceptDiff({ ...message, ...context })
            .then(() => {
                this.telemetryHelper.recordInteractWithMessage(message)
            })
            .catch((error) => {
                this.telemetryHelper.recordInteractWithMessage(message, { result: 'Failed' })
            })
    }

    private async processViewDiff(message: ViewDiff) {
        const context = this.triggerEventsStorage.getTriggerEvent((message.data as any)?.triggerID) || ''
        this.editorContentController
            .viewDiff({ ...message, ...context })
            .then(() => {
                this.telemetryHelper.recordInteractWithMessage(message)
            })
            .catch((error) => {
                this.telemetryHelper.recordInteractWithMessage(message, { result: 'Failed' })
            })
    }

    private async processCopyCodeToClipboard(message: CopyCodeToClipboard) {
        this.telemetryHelper.recordInteractWithMessage(message)
    }

    private async processTabCreateMessage(message: TabCreatedMessage) {
        // this.telemetryHelper.recordOpenChat(message.tabOpenInteractionType)
    }

    private async processTabCloseMessage(message: TabClosedMessage) {
        this.sessionStorage.deleteSession(message.tabID)
        this.triggerEventsStorage.removeTabEvents(message.tabID)
        // this.telemetryHelper.recordCloseChat(message.tabID)
    }

    private async processTabChangedMessage(message: TabChangedMessage) {
        if (message.prevTabID) {
            this.telemetryHelper.recordExitFocusConversation(message.prevTabID)
        }
        this.telemetryHelper.recordEnterFocusConversation(message.tabID)
    }

    private async processUIFocusMessage(message: UIFocusMessage) {
        switch (message.type) {
            case 'focus':
                this.telemetryHelper.recordEnterFocusChat()
                break
            case 'blur':
                this.telemetryHelper.recordExitFocusChat()
                break
        }
    }

    private async processContextCommandUpdateMessage() {
        // when UI is ready, refresh the context commands
        const contextCommand: MynahUIDataModel['contextCommands'] = [
            {
                commands: [
                    ...workspaceCommand.commands,
                    {
                        command: 'folder',
                        children: [
                            {
                                groupName: 'Folders',
                                commands: [],
                            },
                        ],
                        description: 'All files within a specific folder',
                        icon: 'folder' as MynahIconsType,
                    },
                    {
                        command: 'file',
                        children: [
                            {
                                groupName: 'Files',
                                commands: [],
                            },
                        ],
                        description: 'File',
                        icon: 'file' as MynahIconsType,
                    },
                    {
                        command: 'prompts',
                        children: [
                            {
                                groupName: 'Prompts',
                                actions: [
                                    {
                                        id: 'create-prompt',
                                        icon: 'plus',
                                        description: 'Create new prompt',
                                    },
                                ],
                                commands: [],
                            },
                        ],
                        description: 'Prompts',
                        icon: 'magic' as MynahIconsType,
                    },
                ],
            },
        ]

        const feature = FeatureConfigProvider.getFeature(Features.highlightCommand)
        const commandName = feature?.value.stringValue
        if (commandName) {
            const commandDescription = feature.variation
            contextCommand.push({
                groupName: 'Additional Commands',
                commands: [{ command: commandName, description: commandDescription }],
            })
        }
        const promptsCmd: QuickActionCommand = contextCommand[0].commands?.[3]

        // Check .aws/prompts for prompt files in workspace
        const workspacePromptFiles = await vscode.workspace.findFiles(`.aws/prompts/*${promptFileExtension}`)

        if (workspacePromptFiles.length > 0) {
            promptsCmd.children?.[0].commands.push(
                ...workspacePromptFiles.map((file) => ({
                    command: path.basename(file.path, promptFileExtension),
                    icon: 'magic' as MynahIconsType,
                    route: [path.dirname(file.path), path.basename(file.path)],
                }))
            )
        }
        // Check ~/.aws/prompts for global prompt files
        try {
            const systemPromptsDirectory = path.join(fs.getUserHomeDir(), '.aws', 'prompts')
            const directoryExists = await fs.exists(systemPromptsDirectory)
            if (directoryExists) {
                const systemPromptFiles = await fs.readdir(systemPromptsDirectory)
                promptsCmd.children?.[0].commands.push(
                    ...systemPromptFiles
                        .filter(([name]) => name.endsWith(promptFileExtension))
                        .map(([name]) => ({
                            command: path.basename(name, promptFileExtension),
                            icon: 'magic' as MynahIconsType,
                            route: [systemPromptsDirectory, name],
                        }))
                )
            }
        } catch (e) {
            getLogger().verbose(`Could not read prompts from ~/.aws/prompts: ${e}`)
        }

        // Add create prompt button to the bottom of the prompts list
        promptsCmd.children?.[0].commands.push({ command: createPromptCommand, icon: 'list-add' as MynahIconsType })

        const lspClientReady = await LspClient.instance.waitUntilReady()
        if (lspClientReady) {
            const contextCommandItems = await LspClient.instance.getContextCommandItems()
            const folderCmd: QuickActionCommand = contextCommand[0].commands?.[1]
            const filesCmd: QuickActionCommand = contextCommand[0].commands?.[2]

            for (const contextCommandItem of contextCommandItems) {
                const wsFolderName = path.basename(contextCommandItem.workspaceFolder)
                if (contextCommandItem.type === 'file') {
                    filesCmd.children?.[0].commands.push({
                        command: path.basename(contextCommandItem.relativePath),
                        description: path.join(wsFolderName, contextCommandItem.relativePath),
                        route: [contextCommandItem.workspaceFolder, contextCommandItem.relativePath],
                        icon: 'file' as MynahIconsType,
                    })
                } else {
                    folderCmd.children?.[0].commands.push({
                        command: path.basename(contextCommandItem.relativePath),
                        description: path.join(wsFolderName, contextCommandItem.relativePath),
                        route: [contextCommandItem.workspaceFolder, contextCommandItem.relativePath],
                        icon: 'folder' as MynahIconsType,
                    })
                }
            }
        }

        this.messenger.sendContextCommandData(contextCommand)
    }

    private handlePromptCreate(tabID: string) {
        this.messenger.showCustomForm(
            tabID,
            [
                {
                    id: 'prompt-name',
                    type: 'textinput',
                    mandatory: true,
                    title: 'Prompt name',
                    placeholder: 'Enter prompt name',
                    description: 'Use this prompt in the chat by typing `@` followed by the prompt name.',
                },
                {
                    id: 'shared-scope',
                    type: 'select',
                    title: 'Save globally for all projects?',
                    mandatory: true,
                    value: 'system',
                    description: `If yes is selected, ${promptFileExtension} file will be saved in ~/.aws/prompts.`,
                    options: [
                        { value: 'project', label: 'No' },
                        { value: 'system', label: 'Yes' },
                    ],
                },
            ],
            [
                { id: 'cancel-create-prompt', text: 'Cancel', status: 'clear' },
                { id: 'submit-create-prompt', text: 'Create', status: 'main' },
            ],
            `Create a saved prompt`
        )
    }

    private processQuickCommandGroupActionClicked(message: QuickCommandGroupActionClick) {
        if (message.actionId === 'create-prompt') {
            this.handlePromptCreate(message.tabID)
        }
    }

    private async processCustomFormAction(message: CustomFormActionMessage) {
        if (message.tabID) {
            if (message.action.id === 'submit-create-prompt') {
                let promptsDirectory = path.join(fs.getUserHomeDir(), '.aws', 'prompts')
                if (
                    vscode.workspace.workspaceFolders?.[0] &&
                    message.action.formItemValues?.['shared-scope'] === 'project'
                ) {
                    const workspaceUri = vscode.workspace.workspaceFolders[0].uri
                    promptsDirectory = vscode.Uri.joinPath(workspaceUri, '.aws', 'prompts').fsPath
                }

                const title = message.action.formItemValues?.['prompt-name']
                const newFilePath = path.join(
                    promptsDirectory,
                    title ? `${title}${promptFileExtension}` : `default${promptFileExtension}`
                )
                const newFileContent = new Uint8Array(Buffer.from(''))
                await fs.writeFile(newFilePath, newFileContent)
                const newFileDoc = await vscode.workspace.openTextDocument(newFilePath)
                await vscode.window.showTextDocument(newFileDoc)
                await this.processContextCommandUpdateMessage()
            }
        }
    }

    private async processContextSelected(message: ContextSelectedMessage) {
        if (message.tabID && message.contextItem.command === createPromptCommand) {
            this.handlePromptCreate(message.tabID)
        }
    }
    private async processFileClickMessage(message: FileClick) {
        const session = this.sessionStorage.getSession(message.tabID)
        // TODO remove currentContextId but use messageID to track context for each answer message
        const lineRanges = session.contexts.get(session.currentContextId)?.get(message.filePath)

        if (!lineRanges) {
            return
        }

        // TODO: Fix for multiple workspace setup
        const projectRoot = workspace.workspaceFolders?.[0]?.uri.fsPath
        if (!projectRoot) {
            return
        }

        const absoluteFilePath = path.join(projectRoot, message.filePath)

        try {
            // Open the file in VSCode
            const document = await workspace.openTextDocument(absoluteFilePath)
            const editor = await window.showTextDocument(document, ViewColumn.Active)

            // Create multiple selections based on line ranges
            const selections: Selection[] = lineRanges
                .filter(({ first, second }) => first !== -1 && second !== -1)
                .map(({ first, second }) => {
                    const startPosition = new Position(first - 1, 0) // Convert 1-based to 0-based
                    const endPosition = new Position(second - 1, document.lineAt(second - 1).range.end.character)
                    return new Selection(
                        startPosition.line,
                        startPosition.character,
                        endPosition.line,
                        endPosition.character
                    )
                })

            // Apply multiple selections to the editor
            if (selections.length > 0) {
                editor.selection = selections[0] // Set the first selection as active
                editor.selections = selections // Apply multiple selections
                editor.revealRange(selections[0], vscode.TextEditorRevealType.InCenter)
            }
        } catch (error) {}
    }

    private processException(e: any, tabID: string) {
        let errorMessage = ''
        let requestID = undefined
        const defaultMessage = 'Failed to get response'
        if (typeof e === 'string') {
            errorMessage = e.toUpperCase()
        } else if (e instanceof SyntaxError) {
            // Workaround to handle case when LB returns web-page with error and our client doesn't return proper exception
            errorMessage = AwsClientResponseError.tryExtractReasonFromSyntaxError(e) ?? defaultMessage
        } else if (e instanceof CodeWhispererStreamingServiceException) {
            errorMessage = e.message
            requestID = e.$metadata.requestId
        } else if (e instanceof Error) {
            errorMessage = e.message
        }

        this.messenger.sendErrorMessage(errorMessage, tabID, requestID)
        getLogger().error(`error: ${errorMessage} tabID: ${tabID} requestID: ${requestID}`)

        this.sessionStorage.deleteSession(tabID)
    }

    private async processContextMenuCommand(command: EditorContextCommand) {
        // Just open the chat panel in this case
        if (!this.editorContextExtractor.isCodeBlockSelected() && command.type === 'aws.amazonq.sendToPrompt') {
            return
        }

        this.editorContextExtractor
            .extractContextForTrigger('ContextMenu')
            .then(async (context) => {
                const triggerID = randomUUID()
                if (command.type === 'aws.amazonq.generateUnitTests') {
                    DefaultAmazonQAppInitContext.instance.getAppsToWebViewMessagePublisher().publish({
                        sender: 'testChat',
                        command: 'test',
                        type: 'chatMessage',
                    })
                    // For non-supported languages, we'll just open the standard chat.
                    return
                }

                if (context?.focusAreaContext?.codeBlock === undefined) {
                    throw 'Sorry, I cannot help with the selected language code snippet'
                }

                const prompt = this.promptGenerator.generateForContextMenuCommand(command)

                if (command.type === 'aws.amazonq.explainIssue') {
                    this.messenger.sendEditorContextCommandMessage(
                        command.type,
                        context.activeFileContext?.fileText
                            ?.split('\n')
                            .slice(command.issue.startLine, command.issue.endLine)
                            .join('') ?? '',
                        triggerID,
                        command.issue
                    )
                } else {
                    this.messenger.sendEditorContextCommandMessage(
                        command.type,
                        context?.focusAreaContext?.codeBlock ?? '',
                        triggerID
                    )
                }

                if (command.type === 'aws.amazonq.sendToPrompt') {
                    // No need for response if send the code to prompt
                    return
                }

                this.triggerEventsStorage.addTriggerEvent({
                    id: triggerID,
                    tabID: undefined,
                    message: prompt,
                    type: 'editor_context_command',
                    context,
                    command,
                })

                return this.generateResponse(
                    {
                        message: prompt,
                        trigger: ChatTriggerType.ChatMessage,
                        query: undefined,
                        codeSelection: context?.focusAreaContext?.selectionInsideExtendedCodeBlock,
                        fileText: context?.focusAreaContext?.extendedCodeBlock,
                        fileLanguage: context?.activeFileContext?.fileLanguage,
                        filePath: context?.activeFileContext?.filePath,
                        matchPolicy: context?.activeFileContext?.matchPolicy,
                        codeQuery: context?.focusAreaContext?.names,
                        userIntent: this.userIntentRecognizer.getFromContextMenuCommand(command),
                        customization: getSelectedCustomization(),
                    },
                    triggerID
                )
            })
            .catch((e) => {
                this.processException(e, '')
            })
    }

    private async processPromptChatMessage(message: PromptMessage) {
        if (message.message === undefined) {
            this.messenger.sendErrorMessage('chatMessage should be set', message.tabID, undefined)
            return
        }
        try {
            switch (message.command) {
                case 'follow-up-was-clicked':
                    await this.processFollowUp(message)
                    this.telemetryHelper.recordInteractWithMessage(message)
                    break
                case 'onboarding-page-cwc-button-clicked':
                case 'chat-prompt':
                    await this.processPromptMessageAsNewThread(message)
                    break
                default:
                    await this.processCommandMessage(message)
            }
        } catch (e) {
            this.processException(e, message.tabID)
        }
    }

    private async processCommandMessage(message: PromptMessage) {
        if (message.command === undefined) {
            return
        }
        switch (message.command) {
            case 'clear':
                this.sessionStorage.deleteSession(message.tabID)
                this.triggerEventsStorage.removeTabEvents(message.tabID)
                recordTelemetryChatRunCommand('clear')
                return
            default:
                this.processQuickActionCommand(message)
        }
    }

    private async processFollowUp(message: PromptMessage) {
        try {
            const lastTriggerEvent = this.triggerEventsStorage.getLastTriggerEventByTabID(message.tabID)

            if (lastTriggerEvent === undefined) {
                throw "It's impossible to ask follow-ups on empty tabs"
            }

            const triggerID = randomUUID()
            this.triggerEventsStorage.addTriggerEvent({
                id: triggerID,
                tabID: message.tabID,
                message: message.message,
                type: 'follow_up',
                context: lastTriggerEvent.context,
            })

            return this.generateResponse(
                {
                    message: message.message,
                    trigger: ChatTriggerType.ChatMessage,
                    query: message.message,
                    codeSelection: lastTriggerEvent.context?.focusAreaContext?.selectionInsideExtendedCodeBlock,
                    fileText: lastTriggerEvent.context?.focusAreaContext?.extendedCodeBlock,
                    fileLanguage: lastTriggerEvent.context?.activeFileContext?.fileLanguage,
                    filePath: lastTriggerEvent.context?.activeFileContext?.filePath,
                    matchPolicy: lastTriggerEvent.context?.activeFileContext?.matchPolicy,
                    codeQuery: lastTriggerEvent.context?.focusAreaContext?.names,
                    userIntent: message.userIntent,
                    customization: getSelectedCustomization(),
                },
                triggerID
            )
        } catch (e) {
            this.processException(e, message.tabID)
        }
    }

    private async processPromptMessageAsNewThread(message: PromptMessage) {
        this.editorContextExtractor
            .extractContextForTrigger('ChatMessage')
            .then((context) => {
                const triggerID = randomUUID()
                this.triggerEventsStorage.addTriggerEvent({
                    id: triggerID,
                    tabID: message.tabID,
                    message: message.message,
                    type: 'chat_message',
                    context,
                })
                return this.generateResponse(
                    {
                        message: message.message,
                        trigger: ChatTriggerType.ChatMessage,
                        query: message.message,
                        codeSelection: context?.focusAreaContext?.selectionInsideExtendedCodeBlock,
                        fileText: context?.focusAreaContext?.extendedCodeBlock,
                        fileLanguage: context?.activeFileContext?.fileLanguage,
                        filePath: context?.activeFileContext?.filePath,
                        matchPolicy: context?.activeFileContext?.matchPolicy,
                        codeQuery: context?.focusAreaContext?.names,
                        userIntent: this.userIntentRecognizer.getFromPromptChatMessage(message),
                        customization: getSelectedCustomization(),
                        context: message.context,
                    },
                    triggerID
                )
            })
            .catch((e) => {
                this.processException(e, message.tabID)
            })
    }

    private async generateStaticTextResponse(responseType: StaticTextResponseType, triggerID: string) {
        // Loop while we waiting for tabID to be set
        const triggerEvent = this.triggerEventsStorage.getTriggerEvent(triggerID)
        if (triggerEvent === undefined) {
            return
        }

        if (triggerEvent.tabID === 'no-available-tabs') {
            return
        }

        if (triggerEvent.tabID === undefined) {
            setTimeout(() => {
                this.generateStaticTextResponse(responseType, triggerID).catch((e) => {
                    getLogger().error('generateStaticTextResponse failed: %s', (e as Error).message)
                })
            }, 20)
            return
        }

        const tabID = triggerEvent.tabID

        const credentialsState = await AuthUtil.instance.getChatAuthState()

        if (credentialsState.codewhispererChat !== 'connected' && credentialsState.codewhispererCore !== 'connected') {
            await this.messenger.sendAuthNeededExceptionMessage(credentialsState, tabID, triggerID)
            return
        }

        this.messenger.sendStaticTextResponse(responseType, triggerID, tabID)
    }

    private async resolveContextCommandPayload(triggerPayload: TriggerPayload): Promise<string[]> {
        if (triggerPayload.context === undefined || triggerPayload.context.length === 0) {
            return []
        }
        const contextCommands: ContextCommandItem[] = []
        const relativePaths: string[] = []
        for (const context of triggerPayload.context) {
            if (typeof context !== 'string' && context.route && context.route.length === 2) {
                contextCommands.push({
                    workspaceFolder: context.route[0] || '',
                    type: context.icon === 'folder' ? 'folder' : 'file',
                    relativePath: context.route[1] || '',
                })
            }
        }
        if (contextCommands.length === 0) {
            return []
        }
        const workspaceFolder = contextCommands[0].workspaceFolder
        const prompts = await LspClient.instance.getContextCommandPrompt(contextCommands)
        if (prompts.length > 0) {
            triggerPayload.additionalContents = []
            for (const prompt of prompts) {
                // Todo: add mechanism for sorting/prioritization of additional context
                if (triggerPayload.additionalContents.length < 20) {
                    triggerPayload.additionalContents.push({
                        name: prompt.name.substring(0, aditionalContentNameLimit),
                        description: prompt.description.substring(0, aditionalContentNameLimit),
                        innerContext: prompt.content.substring(0, additionalContentInnerContextLimit),
                    })
                    const relativePath = path.relative(workspaceFolder, prompt.filePath)
                    relativePaths.push(relativePath)
                }
            }
            getLogger().info(
                `Retrieved chunks of additional context count: ${triggerPayload.additionalContents.length} `
            )
        }
        return relativePaths
    }

    private async generateResponse(
        triggerPayload: TriggerPayload & { projectContextQueryLatencyMs?: number },
        triggerID: string
    ) {
        const triggerEvent = this.triggerEventsStorage.getTriggerEvent(triggerID)
        if (triggerEvent === undefined) {
            return
        }

        if (triggerEvent.tabID === 'no-available-tabs') {
            return
        }

        if (triggerEvent.tabID === undefined) {
            setTimeout(() => {
                this.generateResponse(triggerPayload, triggerID).catch((e) => {
                    getLogger().error('generateResponse failed: %s', (e as Error).message)
                })
            }, 20)
            return
        }

        const tabID = triggerEvent.tabID

        const credentialsState = await AuthUtil.instance.getChatAuthState()

        if (
            !(credentialsState.codewhispererChat === 'connected' && credentialsState.codewhispererCore === 'connected')
        ) {
            await this.messenger.sendAuthNeededExceptionMessage(credentialsState, tabID, triggerID)
            return
        }

        const relativePaths = await this.resolveContextCommandPayload(triggerPayload)
        // TODO: resolve the context into real context up to 90k
        triggerPayload.useRelevantDocuments = false
        triggerPayload.mergedRelevantDocuments = []
        if (triggerPayload.message) {
            triggerPayload.useRelevantDocuments = triggerPayload.context?.some(
                (context) => typeof context !== 'string' && context.command === '@workspace'
            )
            if (triggerPayload.useRelevantDocuments) {
                triggerPayload.message = triggerPayload.message.replace(/workspace/, '')
                if (CodeWhispererSettings.instance.isLocalIndexEnabled()) {
                    const start = performance.now()
                    triggerPayload.relevantTextDocuments = await LspController.instance.query(triggerPayload.message)
                    triggerPayload.mergedRelevantDocuments = this.mergeRelevantTextDocuments(
                        triggerPayload.relevantTextDocuments
                    )
                    for (const doc of triggerPayload.relevantTextDocuments) {
                        getLogger().info(
                            `amazonq: Using workspace files ${doc.relativeFilePath}, content(partial): ${doc.text?.substring(0, 200)}, start line: ${doc.startLine}, end line: ${doc.endLine}`
                        )
                    }
                    triggerPayload.projectContextQueryLatencyMs = performance.now() - start
                } else {
                    this.messenger.sendOpenSettingsMessage(triggerID, tabID)
                    return
                }
            }
        }

        const request = triggerPayloadToChatRequest(triggerPayload)
        const session = this.sessionStorage.getSession(tabID)

        session.currentContextId++
        session.contexts.set(session.currentContextId, new Map())
        if (triggerPayload.mergedRelevantDocuments !== undefined) {
            const relativePathsOfMergedRelevantDocuments = triggerPayload.mergedRelevantDocuments.map(
                (doc) => doc.relativeFilePath
            )
            for (const relativePath of relativePaths) {
                if (!relativePathsOfMergedRelevantDocuments.includes(relativePath)) {
                    triggerPayload.mergedRelevantDocuments.push({
                        relativeFilePath: relativePath,
                        lineRanges: [{ first: -1, second: -1 }],
                    })
                }
            }
            if (triggerPayload.mergedRelevantDocuments) {
                for (const doc of triggerPayload.mergedRelevantDocuments) {
                    const currentContext = session.contexts.get(session.currentContextId)
                    if (currentContext) {
                        currentContext.set(doc.relativeFilePath, doc.lineRanges)
                    }
                }
            }
        }

        getLogger().info(
            `request from tab: ${tabID} conversationID: ${session.sessionIdentifier} request: ${inspect(request, {
                depth: 12,
            })}`
        )
        let response: MessengerResponseType | undefined = undefined
        session.createNewTokenSource()
        try {
            this.messenger.sendInitalStream(tabID, triggerID, triggerPayload.mergedRelevantDocuments)
            this.telemetryHelper.setConversationStreamStartTime(tabID)
            if (isSsoConnection(AuthUtil.instance.conn)) {
                const { $metadata, generateAssistantResponseResponse } = await session.chatSso(request)
                response = {
                    $metadata: $metadata,
                    message: generateAssistantResponseResponse,
                }
            } else {
                const { $metadata, sendMessageResponse } = await session.chatIam(request as SendMessageRequest)
                response = {
                    $metadata: $metadata,
                    message: sendMessageResponse,
                }
            }
            this.telemetryHelper.recordEnterFocusConversation(triggerEvent.tabID)
            this.telemetryHelper.recordStartConversation(triggerEvent, triggerPayload)

            getLogger().info(
                `response to tab: ${tabID} conversationID: ${session.sessionIdentifier} requestID: ${
                    response.$metadata.requestId
                } metadata: ${inspect(response.$metadata, { depth: 12 })}`
            )
            await this.messenger.sendAIResponse(response, session, tabID, triggerID, triggerPayload)
        } catch (e: any) {
            this.telemetryHelper.recordMessageResponseError(triggerPayload, tabID, getHttpStatusCode(e) ?? 0)
            // clears session, record telemetry before this call
            this.processException(e, tabID)
        }
    }

    private mergeRelevantTextDocuments(
        documents: RelevantTextDocumentAddition[] | undefined
    ): MergedRelevantDocument[] | undefined {
        if (documents === undefined) {
            return undefined
        }
        return Object.entries(
            documents.reduce<Record<string, { first: number; second: number }[]>>((acc, doc) => {
                if (!doc.relativeFilePath || doc.startLine === undefined || doc.endLine === undefined) {
                    return acc // Skip invalid documents
                }

                if (!acc[doc.relativeFilePath]) {
                    acc[doc.relativeFilePath] = []
                }
                acc[doc.relativeFilePath].push({ first: doc.startLine, second: doc.endLine })
                return acc
            }, {})
        ).map(([filePath, ranges]) => {
            // Sort by startLine
            const sortedRanges = ranges.sort((a, b) => a.first - b.first)

            const mergedRanges: { first: number; second: number }[] = []
            for (const { first, second } of sortedRanges) {
                if (mergedRanges.length === 0 || mergedRanges[mergedRanges.length - 1].second < first - 1) {
                    // If no overlap, add new range
                    mergedRanges.push({ first, second })
                } else {
                    // Merge overlapping or consecutive ranges
                    mergedRanges[mergedRanges.length - 1].second = Math.max(
                        mergedRanges[mergedRanges.length - 1].second,
                        second
                    )
                }
            }

            return { relativeFilePath: filePath, lineRanges: mergedRanges }
        })
    }
}
