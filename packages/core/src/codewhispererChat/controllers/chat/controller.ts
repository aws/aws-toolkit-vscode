/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as path from 'path'
import * as vscode from 'vscode'
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
    DocumentReference,
    FileClick,
    RelevantTextDocumentAddition,
    TabBarButtonClick,
    SaveChatMessage,
} from './model'
import {
    AppToWebViewMessageDispatcher,
    ContextSelectedMessage,
    CustomFormActionMessage,
    DetailedListActionClickMessage,
    DetailedListFilterChangeMessage,
    DetailedListItemSelectMessage,
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
import { AdditionalContextPrompt, ContextCommandItem, ContextCommandItemType } from '../../../amazonq/lsp/types'
import { workspaceCommand } from '../../../amazonq/webview/ui/tabs/constants'
import fs from '../../../shared/fs/fs'
import { FeatureConfigProvider, Features } from '../../../shared/featureConfig'
import { i18n } from '../../../shared/i18n-helper'
import {
    getUserPromptsDirectory,
    promptFileExtension,
    createSavedPromptCommandId,
    aditionalContentNameLimit,
    additionalContentInnerContextLimit,
    workspaceChunkMaxSize,
    defaultContextLengths,
} from '../../constants'
import { ChatSession } from '../../clients/chat/v0/chat'
import { Database } from '../../../shared/db/chatDb/chatDb'
import { TabBarController } from './tabBarController'

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
    readonly processTabBarButtonClick: MessagePublisher<TabBarButtonClick>
    readonly processSaveChat: MessagePublisher<SaveChatMessage>
    readonly processDetailedListFilterChangeMessage: MessagePublisher<DetailedListFilterChangeMessage>
    readonly processDetailedListItemSelectMessage: MessagePublisher<DetailedListItemSelectMessage>
    readonly processDetailedListActionClickMessage: MessagePublisher<DetailedListActionClickMessage>
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
    readonly processTabBarButtonClick: MessageListener<TabBarButtonClick>
    readonly processSaveChat: MessageListener<SaveChatMessage>
    readonly processDetailedListFilterChangeMessage: MessageListener<DetailedListFilterChangeMessage>
    readonly processDetailedListItemSelectMessage: MessageListener<DetailedListItemSelectMessage>
    readonly processDetailedListActionClickMessage: MessageListener<DetailedListActionClickMessage>
}

export class ChatController {
    private readonly sessionStorage: ChatSessionStorage
    private readonly triggerEventsStorage: TriggerEventsStorage
    private readonly messenger: Messenger
    private readonly editorContextExtractor: EditorContextExtractor
    private readonly editorContentController: EditorContentController
    private readonly tabBarController: TabBarController
    private readonly promptGenerator: PromptsGenerator
    private readonly userIntentRecognizer: UserIntentRecognizer
    private readonly telemetryHelper: CWCTelemetryHelper
    private userPromptsWatcher: vscode.FileSystemWatcher | undefined
    private chatHistoryDb = Database.getInstance()
    private cancelTokenSource: vscode.CancellationTokenSource = new vscode.CancellationTokenSource()

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
        this.tabBarController = new TabBarController(this.messenger)

        onDidChangeAmazonQVisibility((visible) => {
            if (visible) {
                this.telemetryHelper.recordOpenChat()
            } else {
                this.telemetryHelper.recordCloseChat()
            }
        })

        AuthUtil.instance.regionProfileManager.onDidChangeRegionProfile(() => {
            this.cancelTokenSource.cancel()
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
        this.chatControllerMessageListeners.processTabBarButtonClick.onMessage((data) => {
            return this.tabBarController.processTabBarButtonClick(data)
        })
        this.chatControllerMessageListeners.processSaveChat.onMessage((data) => {
            return this.tabBarController.processSaveChat(data)
        })
        this.chatControllerMessageListeners.processDetailedListActionClickMessage.onMessage((data) => {
            return this.tabBarController.processActionClickMessage(data)
        })
        this.chatControllerMessageListeners.processDetailedListFilterChangeMessage.onMessage((data) => {
            return this.tabBarController.processFilterChangeMessage(data)
        })
        this.chatControllerMessageListeners.processDetailedListItemSelectMessage.onMessage((data) => {
            return this.tabBarController.processItemSelectMessage(data)
        })
        AuthUtil.instance.regionProfileManager.onDidChangeRegionProfile(() => {
            this.sessionStorage.deleteAllSessions()
        })
    }

    private registerUserPromptsWatcher() {
        if (this.userPromptsWatcher) {
            return
        }
        this.userPromptsWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(vscode.Uri.file(getUserPromptsDirectory()), `*${promptFileExtension}`),
            false,
            true,
            false
        )
        this.userPromptsWatcher.onDidCreate(() => this.processContextCommandUpdateMessage())
        this.userPromptsWatcher.onDidDelete(() => this.processContextCommandUpdateMessage())
        globals.context.subscriptions.push(this.userPromptsWatcher)
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
        this.chatHistoryDb.updateTabOpenState(message.tabID, false)
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
        this.tabBarController.loadChats()
        this.registerUserPromptsWatcher()
        const contextCommand: MynahUIDataModel['contextCommands'] = [
            {
                commands: [
                    ...workspaceCommand.commands,
                    {
                        command: i18n('AWS.amazonq.context.folders.title'),
                        children: [
                            {
                                groupName: i18n('AWS.amazonq.context.folders.title'),
                                commands: [],
                            },
                        ],
                        description: i18n('AWS.amazonq.context.folders.description'),
                        icon: 'folder' as MynahIconsType,
                    },
                    {
                        command: i18n('AWS.amazonq.context.files.title'),
                        children: [
                            {
                                groupName: i18n('AWS.amazonq.context.files.title'),
                                commands: [],
                            },
                        ],
                        description: i18n('AWS.amazonq.context.files.description'),
                        icon: 'file' as MynahIconsType,
                    },
                    {
                        command: i18n('AWS.amazonq.context.code.title'),
                        children: [
                            {
                                groupName: i18n('AWS.amazonq.context.code.title'),
                                commands: [],
                            },
                        ],
                        description: i18n('AWS.amazonq.context.code.description'),
                        icon: 'code-block' as MynahIconsType,
                    },
                    {
                        command: i18n('AWS.amazonq.context.prompts.title'),
                        children: [
                            {
                                groupName: i18n('AWS.amazonq.context.prompts.title'),
                                commands: [],
                            },
                        ],
                        description: i18n('AWS.amazonq.context.prompts.description'),
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
        const symbolsCmd: QuickActionCommand = contextCommand[0].commands?.[3]
        const promptsCmd: QuickActionCommand = contextCommand[0].commands?.[4]

        // Check for user prompts
        try {
            const userPromptsDirectory = getUserPromptsDirectory()
            const directoryExists = await fs.exists(userPromptsDirectory)
            if (directoryExists) {
                const systemPromptFiles = await fs.readdir(userPromptsDirectory)
                promptsCmd.children?.[0].commands.push(
                    ...systemPromptFiles
                        .filter(([name]) => name.endsWith(promptFileExtension))
                        .map(([name]) => ({
                            command: path.basename(name, promptFileExtension),
                            icon: 'magic' as MynahIconsType,
                            id: 'prompt',
                            label: 'file' as ContextCommandItemType,
                            route: [userPromptsDirectory, name],
                        }))
                )
            }
        } catch (e) {
            getLogger().verbose(`Could not read prompts from ~/.aws/prompts: ${e}`)
        }

        // Add create prompt button to the bottom of the prompts list
        promptsCmd.children?.[0].commands.push({
            command: i18n('AWS.amazonq.savedPrompts.action'),
            id: createSavedPromptCommandId,
            icon: 'list-add' as MynahIconsType,
        })

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
                        label: 'file' as ContextCommandItemType,
                        id: contextCommandItem.id,
                        icon: 'file' as MynahIconsType,
                    })
                } else if (contextCommandItem.type === 'folder') {
                    folderCmd.children?.[0].commands.push({
                        command: path.basename(contextCommandItem.relativePath),
                        description: path.join(wsFolderName, contextCommandItem.relativePath),
                        route: [contextCommandItem.workspaceFolder, contextCommandItem.relativePath],
                        label: 'folder' as ContextCommandItemType,
                        id: contextCommandItem.id,
                        icon: 'folder' as MynahIconsType,
                    })
                } else if (contextCommandItem.symbol && symbolsCmd.children) {
                    symbolsCmd.children?.[0].commands.push({
                        command: contextCommandItem.symbol.name,
                        description: `${contextCommandItem.symbol.kind}, ${path.join(wsFolderName, contextCommandItem.relativePath)}, L${contextCommandItem.symbol.range.start.line}-${contextCommandItem.symbol.range.end.line}`,
                        route: [contextCommandItem.workspaceFolder, contextCommandItem.relativePath],
                        label: 'code' as ContextCommandItemType,
                        id: contextCommandItem.id,
                        icon: 'code-block' as MynahIconsType,
                    })
                }
            }
        }

        this.messenger.sendContextCommandData(contextCommand)
        void LspController.instance.updateContextCommandSymbolsOnce()
    }

    private handlePromptCreate(tabID: string) {
        this.messenger.showCustomForm(
            tabID,
            [
                {
                    id: 'prompt-name',
                    type: 'textinput',
                    mandatory: true,
                    autoFocus: true,
                    title: i18n('AWS.amazonq.savedPrompts.title'),
                    placeholder: i18n('AWS.amazonq.savedPrompts.placeholder'),
                    description: i18n('AWS.amazonq.savedPrompts.description'),
                },
            ],
            [
                { id: 'cancel-create-prompt', text: i18n('AWS.generic.cancel'), status: 'clear' },
                { id: 'submit-create-prompt', text: i18n('AWS.amazonq.savedPrompts.create'), status: 'main' },
            ],
            `Create a saved prompt`
        )
    }

    private processQuickCommandGroupActionClicked(message: QuickCommandGroupActionClick) {
        if (message.actionId === createSavedPromptCommandId) {
            this.handlePromptCreate(message.tabID)
        }
    }

    private async processCustomFormAction(message: CustomFormActionMessage) {
        if (message.action.id === 'submit-create-prompt') {
            const userPromptsDirectory = getUserPromptsDirectory()

            const title = message.action.formItemValues?.['prompt-name']
            const newFilePath = path.join(
                userPromptsDirectory,
                title ? `${title}${promptFileExtension}` : `default${promptFileExtension}`
            )
            const newFileContent = new Uint8Array(Buffer.from(''))
            await fs.writeFile(newFilePath, newFileContent, { mode: 0o600 })
            const newFileDoc = await vscode.workspace.openTextDocument(newFilePath)
            await vscode.window.showTextDocument(newFileDoc)
            telemetry.ui_click.emit({ elementId: 'amazonq_createSavedPrompt' })
        }
    }

    private async processContextSelected(message: ContextSelectedMessage) {
        if (message.tabID && message.contextItem.id === createSavedPromptCommandId) {
            this.handlePromptCreate(message.tabID)
        }
    }
    private async processFileClickMessage(message: FileClick) {
        const session = this.sessionStorage.getSession(message.tabID)
        const lineRanges = session.contexts.get(message.filePath)

        if (!lineRanges) {
            return
        }

        // Check if clicked file is in a different workspace root
        const projectRoot =
            session.relativePathToWorkspaceRoot.get(message.filePath) || workspace.workspaceFolders?.[0]?.uri.fsPath
        if (!projectRoot) {
            return
        }
        let absoluteFilePath = path.join(projectRoot, message.filePath)

        // Handle clicking on a user prompt outside the workspace
        if (message.filePath.endsWith(promptFileExtension)) {
            try {
                await vscode.workspace.fs.stat(vscode.Uri.file(absoluteFilePath))
            } catch {
                absoluteFilePath = path.join(getUserPromptsDirectory(), message.filePath)
            }
        }

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
                        fileText: context?.focusAreaContext?.extendedCodeBlock ?? '',
                        fileLanguage: context?.activeFileContext?.fileLanguage,
                        filePath: context?.activeFileContext?.filePath,
                        matchPolicy: context?.activeFileContext?.matchPolicy,
                        codeQuery: context?.focusAreaContext?.names,
                        userIntent: this.userIntentRecognizer.getFromContextMenuCommand(command),
                        customization: getSelectedCustomization(),
                        profile: AuthUtil.instance.regionProfileManager.activeRegionProfile,
                        additionalContents: [],
                        relevantTextDocuments: [],
                        documentReferences: [],
                        useRelevantDocuments: false,
                        contextLengths: {
                            ...defaultContextLengths,
                        },
                        context: [],
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
                this.chatHistoryDb.clearTab(message.tabID)
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
                    message: message.message ?? '',
                    trigger: ChatTriggerType.ChatMessage,
                    query: message.message,
                    codeSelection: lastTriggerEvent.context?.focusAreaContext?.selectionInsideExtendedCodeBlock,
                    fileText: lastTriggerEvent.context?.focusAreaContext?.extendedCodeBlock ?? '',
                    fileLanguage: lastTriggerEvent.context?.activeFileContext?.fileLanguage,
                    filePath: lastTriggerEvent.context?.activeFileContext?.filePath,
                    matchPolicy: lastTriggerEvent.context?.activeFileContext?.matchPolicy,
                    codeQuery: lastTriggerEvent.context?.focusAreaContext?.names,
                    userIntent: message.userIntent,
                    customization: getSelectedCustomization(),
                    profile: AuthUtil.instance.regionProfileManager.activeRegionProfile,
                    contextLengths: {
                        ...defaultContextLengths,
                    },
                    relevantTextDocuments: [],
                    additionalContents: [],
                    documentReferences: [],
                    useRelevantDocuments: false,
                    context: [],
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
                        message: message.message ?? '',
                        trigger: ChatTriggerType.ChatMessage,
                        query: message.message,
                        codeSelection: context?.focusAreaContext?.selectionInsideExtendedCodeBlock,
                        fileText: context?.focusAreaContext?.extendedCodeBlock ?? '',
                        fileLanguage: context?.activeFileContext?.fileLanguage,
                        filePath: context?.activeFileContext?.filePath,
                        matchPolicy: context?.activeFileContext?.matchPolicy,
                        codeQuery: context?.focusAreaContext?.names,
                        userIntent: this.userIntentRecognizer.getFromPromptChatMessage(message),
                        customization: getSelectedCustomization(),
                        profile: AuthUtil.instance.regionProfileManager.activeRegionProfile,
                        context: message.context ?? [],
                        relevantTextDocuments: [],
                        additionalContents: [],
                        documentReferences: [],
                        useRelevantDocuments: false,
                        contextLengths: {
                            ...defaultContextLengths,
                        },
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

    /**
     * @returns A Uri array of prompt files in each workspace root's .amazonq/rules directory
     */
    private async collectWorkspaceRules(): Promise<string[]> {
        const rulesFiles: string[] = []

        if (!vscode.workspace.workspaceFolders) {
            return rulesFiles
        }

        for (const folder of vscode.workspace.workspaceFolders) {
            const rulesPath = path.join(folder.uri.fsPath, '.amazonq', 'rules')
            const folderExists = await fs.exists(rulesPath)

            if (folderExists) {
                const entries = await fs.readdir(rulesPath)

                for (const [name, type] of entries) {
                    if (type === vscode.FileType.File && name.endsWith(promptFileExtension)) {
                        rulesFiles.push(path.join(rulesPath, name))
                    }
                }
            }
        }

        return rulesFiles
    }

    private async resolveContextCommandPayload(triggerPayload: TriggerPayload, session: ChatSession) {
        const contextCommands: ContextCommandItem[] = []

        // Check for workspace rules to add to context
        const workspaceRules = await this.collectWorkspaceRules()
        if (workspaceRules.length > 0) {
            contextCommands.push(
                ...workspaceRules.map((rule) => {
                    const workspaceFolderPath =
                        vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(rule))?.uri?.path || ''
                    return {
                        workspaceFolder: workspaceFolderPath,
                        type: 'file' as ContextCommandItemType,
                        relativePath: path.relative(workspaceFolderPath, rule),
                    }
                })
            )
        }
        triggerPayload.workspaceRulesCount = workspaceRules.length

        for (const context of triggerPayload.context) {
            if (typeof context !== 'string' && context.route && context.route.length === 2) {
                contextCommands.push({
                    workspaceFolder: context.route[0] || '',
                    type: (context.label || '') as ContextCommandItemType,
                    relativePath: context.route[1] || '',
                    id: context.id,
                })
            }
        }

        if (contextCommands.length === 0) {
            return []
        }
        const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath)
        if (!workspaceFolders) {
            return []
        }
        workspaceFolders.sort()
        const workspaceFolder = workspaceFolders[0]
        for (const contextCommand of contextCommands) {
            session.relativePathToWorkspaceRoot.set(contextCommand.workspaceFolder, contextCommand.workspaceFolder)
        }
        let prompts: AdditionalContextPrompt[] = []
        try {
            prompts = await LspClient.instance.getContextCommandPrompt(contextCommands)
        } catch (e) {
            // todo: handle @workspace used before indexing is ready
            getLogger().verbose(`Could not get context command prompts: ${e}`)
        }

        triggerPayload.contextLengths.additionalContextLengths = this.telemetryHelper.getContextLengths(prompts)
        for (const prompt of prompts.slice(0, 20)) {
            // Add system prompt for user prompts and workspace rules
            const contextType = this.telemetryHelper.getContextType(prompt)
            const description =
                contextType === 'rule' || contextType === 'prompt'
                    ? `You must follow the instructions in ${prompt.relativePath}. Below are lines ${prompt.startLine}-${prompt.endLine} of this file:\n`
                    : prompt.description

            // Handle user prompts outside the workspace
            const relativePath = prompt.filePath.startsWith(getUserPromptsDirectory())
                ? path.basename(prompt.filePath)
                : path.relative(workspaceFolder, prompt.filePath)

            const entry = {
                name: prompt.name.substring(0, aditionalContentNameLimit),
                description: description.substring(0, aditionalContentNameLimit),
                innerContext: prompt.content.substring(0, additionalContentInnerContextLimit),
                type: contextType,
                relativePath: relativePath,
                startLine: prompt.startLine,
                endLine: prompt.endLine,
            }

            triggerPayload.additionalContents.push(entry)
        }
        getLogger().info(`Retrieved chunks of additional context count: ${triggerPayload.additionalContents.length} `)
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

        const session = this.sessionStorage.getSession(tabID)
        if (!session.localHistoryHydrated) {
            triggerPayload.history = this.chatHistoryDb.getMessages(triggerEvent.tabID, 10)
            session.localHistoryHydrated = true
        }
        await this.resolveContextCommandPayload(triggerPayload, session)
        triggerPayload.useRelevantDocuments = triggerPayload.context.some(
            (context) => typeof context !== 'string' && context.command === '@workspace'
        )
        if (triggerPayload.useRelevantDocuments) {
            triggerPayload.message = triggerPayload.message.replace(/@workspace/, '')
            if (CodeWhispererSettings.instance.isLocalIndexEnabled()) {
                const start = performance.now()
                const relevantTextDocuments = await LspController.instance.query(triggerPayload.message)
                for (const relevantDocument of relevantTextDocuments) {
                    if (relevantDocument.text && relevantDocument.text.length > 0) {
                        triggerPayload.contextLengths.workspaceContextLength += relevantDocument.text.length
                        if (relevantDocument.text.length > workspaceChunkMaxSize) {
                            relevantDocument.text = relevantDocument.text.substring(0, workspaceChunkMaxSize)
                            getLogger().debug(`Truncating @workspace chunk: ${relevantDocument.relativeFilePath} `)
                        }
                        triggerPayload.relevantTextDocuments.push(relevantDocument)
                    }
                }

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

        triggerPayload.contextLengths.userInputContextLength = triggerPayload.message.length
        triggerPayload.contextLengths.focusFileContextLength = triggerPayload.fileText.length
        const request = triggerPayloadToChatRequest(triggerPayload)
        triggerPayload.documentReferences = this.mergeRelevantTextDocuments(triggerPayload.relevantTextDocuments)

        // Update context transparency after it's truncated dynamically to show users only the context sent.
        const relativePathsOfMergedRelevantDocuments = triggerPayload.documentReferences.map(
            (doc) => doc.relativeFilePath
        )
        const seen: string[] = []
        for (const additionalContent of triggerPayload.additionalContents) {
            const relativePath = additionalContent.relativePath
            if (!relativePathsOfMergedRelevantDocuments.includes(relativePath) && !seen.includes(relativePath)) {
                triggerPayload.documentReferences.push({
                    relativeFilePath: relativePath,
                    lineRanges:
                        additionalContent.name === 'symbol'
                            ? [{ first: additionalContent.startLine, second: additionalContent.endLine }]
                            : [{ first: -1, second: -1 }],
                })
                seen.push(relativePath)
            }
        }
        for (const doc of triggerPayload.documentReferences) {
            session.contexts.set(doc.relativeFilePath, doc.lineRanges)
        }

        getLogger().debug(
            `request from tab: ${tabID} conversationID: ${session.sessionIdentifier} request: ${inspect(request, {
                depth: 12,
            })}`
        )
        let response: MessengerResponseType | undefined = undefined
        session.createNewTokenSource()
        // TODO: onProfileChanged, abort previous response?
        try {
            this.messenger.sendInitalStream(tabID, triggerID, triggerPayload.documentReferences)
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
            if (session.sessionIdentifier) {
                this.chatHistoryDb.addMessage(tabID, 'cwc', session.sessionIdentifier, {
                    body: triggerPayload.message,
                    type: 'prompt' as any,
                })
            }

            getLogger().info(
                `response to tab: ${tabID} conversationID: ${session.sessionIdentifier} requestID: ${
                    response.$metadata.requestId
                } metadata: ${inspect(response.$metadata, { depth: 12 })}`
            )
            this.cancelTokenSource = new vscode.CancellationTokenSource()
            await this.messenger.sendAIResponse(
                response,
                session,
                tabID,
                triggerID,
                triggerPayload,
                this.cancelTokenSource.token
            )
        } catch (e: any) {
            this.telemetryHelper.recordMessageResponseError(triggerPayload, tabID, getHttpStatusCode(e) ?? 0)
            // clears session, record telemetry before this call
            this.processException(e, tabID)
        }
    }

    private mergeRelevantTextDocuments(documents: RelevantTextDocumentAddition[]): DocumentReference[] {
        if (documents.length === 0) {
            return []
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
