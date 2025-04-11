/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AppToWebViewMessageDispatcher,
    AuthNeededException,
    CodeReference,
    ContextCommandData,
    CustomFormActionMessage,
    EditorContextCommandMessage,
    ExportChatMessage,
    OpenSettingsMessage,
    OpenDetailedListMessage,
    QuickActionMessage,
    RestoreTabMessage,
    ShowCustomFormMessage,
    UpdateDetailedListMessage,
    CloseDetailedListMessage,
    SelectTabMessage,
    ChatItemHeader,
    ToolMessage,
} from '../../../view/connector/connector'
import { EditorContextCommandType } from '../../../commands/registerCommands'
import { ChatResponseStream as qdevChatResponseStream } from '@amzn/amazon-q-developer-streaming-client'
import {
    ChatResponseStream as cwChatResponseStream,
    SupplementaryWebLink,
    ToolUse,
} from '@amzn/codewhisperer-streaming'
import { ChatMessage, ErrorMessage, FollowUp, Suggestion } from '../../../view/connector/connector'
import { ChatSession } from '../../../clients/chat/v0/chat'
import { ChatException } from './model'
import { CWCTelemetryHelper } from '../telemetryHelper'
import { AgenticChatInteractionType, ChatPromptCommandType, DocumentReference, TriggerPayload } from '../model'
import { ToolkitError } from '../../../../shared/errors'
import { keys } from '../../../../shared/utilities/tsUtils'
import { getLogger } from '../../../../shared/logger/logger'
import { FeatureAuthState } from '../../../../codewhisperer/util/authUtil'
import { CodeScanIssue } from '../../../../codewhisperer/models/model'
import { marked } from 'marked'
import { JSDOM } from 'jsdom'
import { LspController } from '../../../../amazonq/lsp/lspController'
import { extractCodeBlockLanguage } from '../../../../shared/markdown'
import { extractAuthFollowUp } from '../../../../amazonq/util/authUtils'
import { helpMessage } from '../../../../amazonq/webview/ui/texts/constants'
import {
    ChatItem,
    ChatItemButton,
    ChatItemContent,
    ChatItemFormItem,
    MynahIconsType,
    DetailedList,
    MynahUIDataModel,
    MynahIcons,
    Status,
} from '@aws/mynah-ui'
import { Database } from '../../../../shared/db/chatDb/chatDb'
import { TabType } from '../../../../amazonq/webview/ui/storages/tabsStorage'
import { ToolType, ToolUtils } from '../../../tools/toolUtils'
import { ChatStream } from '../../../tools/chatStream'
import path from 'path'
import { CommandValidation, ExecuteBashParams } from '../../../tools/executeBash'
import { extractErrorInfo } from '../../../../shared/utilities/messageUtil'
import { noWriteTools, tools } from '../../../constants'
import { Change } from 'diff'
import { FsWriteParams } from '../../../tools/fsWrite'
import { AsyncEventProgressMessage } from '../../../../amazonq/commons/connector/connectorMessages'
import { localize } from '../../../../shared/utilities/vsCodeUtils'
import { getDiffLinesFromChanges } from '../../../../shared/utilities/diffUtils'
import { ConversationTracker } from '../../../storages/conversationTracker'
import { waitTimeout, Timeout } from '../../../../shared/utilities/timeoutUtils'
import { FsReadParams } from '../../../tools/fsRead'
import { ListDirectoryParams } from '../../../tools/listDirectory'

export type StaticTextResponseType = 'quick-action-help' | 'onboarding-help' | 'transform' | 'help'

export type MessengerResponseType = {
    $metadata: { requestId?: string; httpStatusCode?: number }
    message?: AsyncIterable<cwChatResponseStream | qdevChatResponseStream>
}

export class Messenger {
    chatHistoryDb = Database.getInstance()

    public constructor(
        private readonly dispatcher: AppToWebViewMessageDispatcher,
        private readonly telemetryHelper: CWCTelemetryHelper
    ) {}

    public async sendAuthNeededExceptionMessage(credentialState: FeatureAuthState, tabID: string, triggerID: string) {
        const { message, authType } = extractAuthFollowUp(credentialState)
        this.dispatcher.sendAuthNeededExceptionMessage(
            new AuthNeededException(
                {
                    message,
                    authType,
                    triggerID,
                },
                tabID
            )
        )
    }

    public sendInitalStream(tabID: string, triggerID: string) {
        // Check if the conversation has been cancelled
        if (this.isTriggerCancelled(triggerID)) {
            getLogger().debug(`Initial stream sending cancelled for tabID: ${tabID}, triggerID: ${triggerID}`)
            return
        }

        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message: '',
                    messageType: 'answer-stream',
                    followUps: undefined,
                    followUpsHeader: undefined,
                    relatedSuggestions: undefined,
                    triggerID,
                    messageID: triggerID,
                    userIntent: undefined,
                    codeBlockLanguage: undefined,
                    contextList: undefined,
                    buttons: undefined,
                    fileList: undefined,
                    canBeVoted: false,
                },
                tabID
            )
        )
    }

    public sendContextMessage(
        tabID: string,
        triggerID: string,
        mergedRelevantDocuments: DocumentReference[] | undefined
    ) {
        // Check if the conversation has been cancelled
        if (this.isTriggerCancelled(triggerID)) {
            getLogger().debug(`Context message sending cancelled for tabID: ${tabID}, triggerID: ${triggerID}`)
            return
        }

        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message: '',
                    messageType: 'answer-stream',
                    followUps: undefined,
                    followUpsHeader: undefined,
                    relatedSuggestions: undefined,
                    triggerID,
                    messageID: '',
                    userIntent: undefined,
                    codeBlockLanguage: undefined,
                    contextList: mergedRelevantDocuments,
                    title: '',
                    rootFolderTitle: 'Context',
                    buttons: undefined,
                    fileList: undefined,
                    canBeVoted: false,
                    padding: false,
                },
                tabID
            )
        )
    }

    /**
     * Tries to calculate the total number of code blocks.
     * NOTES:
     *  - Not correct on all examples. Some may cause it to return 0 unexpectedly.
     *  - Plans in place (as of 4/22/2024) to move this server side.
     *  - See original pr: https://github.com/aws/aws-toolkit-vscode/pull/4761 for more details.
     * @param message raw message response from codewhisperer client.
     * @returns count of multi-line code blocks in response.
     */
    public async countTotalNumberOfCodeBlocks(message: string): Promise<number> {
        // TODO: remove this when moved to server-side.
        if (message === undefined) {
            return 0
        }

        // To Convert Markdown text to HTML using marked library
        const html = await marked(message)

        const dom = new JSDOM(html)
        const document = dom.window.document

        // Search for <pre> elements containing <code> elements
        const codeBlocks = document.querySelectorAll('pre > code')

        return codeBlocks.length
    }

    public async sendAIResponse(
        response: MessengerResponseType,
        session: ChatSession,
        tabID: string,
        triggerID: string,
        triggerPayload: TriggerPayload
    ) {
        let message = ''
        const messageID = response.$metadata.requestId ?? ''
        let codeReference: CodeReference[] = []
        let followUps: FollowUp[] = []
        let relatedSuggestions: Suggestion[] = []
        let codeBlockLanguage: string = 'plaintext'
        let toolUseInput = ''
        const toolUse: ToolUse = { toolUseId: undefined, name: undefined, input: undefined }
        const conversationTracker = ConversationTracker.getInstance()

        if (response.message === undefined) {
            throw new ToolkitError(
                `Empty response from CodeWhisperer Streaming service. Request ID: ${response.$metadata.requestId}`
            )
        }
        this.telemetryHelper.setResponseStreamStartTime(tabID)

        let cwsprChatHasProjectContext = false
        if (
            triggerPayload.relevantTextDocuments &&
            triggerPayload.relevantTextDocuments.length > 0 &&
            triggerPayload.useRelevantDocuments === true
        ) {
            cwsprChatHasProjectContext = true
        }
        const additionalCounts = this.telemetryHelper.getAdditionalContextCounts(triggerPayload)

        this.telemetryHelper.setResponseFromAdditionalContext(messageID, {
            cwsprChatHasProjectContext,
            cwsprChatRuleContextCount: triggerPayload.workspaceRulesCount,
            cwsprChatFileContextCount: additionalCounts.fileContextCount,
            cwsprChatFolderContextCount: additionalCounts.folderContextCount,
            cwsprChatPromptContextCount: additionalCounts.promptContextCount,
        })

        const eventCounts = new Map<string, number>()
        const timeout = new Timeout(600000) // 10 minutes timeout

        await waitTimeout(
            async () => {
                for await (const chatEvent of response.message!) {
                    if (this.isTriggerCancelled(triggerID)) {
                        return
                    }

                    for (const key of keys(chatEvent)) {
                        if ((chatEvent[key] as any) !== undefined) {
                            eventCounts.set(key, (eventCounts.get(key) ?? 0) + 1)
                        }
                    }

                    if (session.tokenSource.token.isCancellationRequested) {
                        return true
                    }

                    if (
                        chatEvent.codeReferenceEvent?.references !== undefined &&
                        chatEvent.codeReferenceEvent.references.length > 0
                    ) {
                        codeReference = [
                            ...codeReference,
                            ...chatEvent.codeReferenceEvent.references.map((reference) => ({
                                ...reference,
                                recommendationContentSpan: {
                                    start: reference.recommendationContentSpan?.start ?? 0,
                                    end: reference.recommendationContentSpan?.end ?? 0,
                                },
                                information: `Reference code under **${reference.licenseName}** license from repository \`${reference.repository}\``,
                            })),
                        ]
                    }

                    const cwChatEvent: cwChatResponseStream = chatEvent
                    if (cwChatEvent.toolUseEvent?.input !== undefined && cwChatEvent.toolUseEvent.input.length > 0) {
                        toolUseInput += cwChatEvent.toolUseEvent.input
                    }

                    if (cwChatEvent.toolUseEvent?.stop) {
                        toolUse.toolUseId = cwChatEvent.toolUseEvent.toolUseId ?? ''
                        toolUse.name = cwChatEvent.toolUseEvent.name ?? ''
                        try {
                            if (this.isTriggerCancelled(triggerID)) {
                                return
                            }
                            try {
                                toolUse.input = JSON.parse(toolUseInput)
                            } catch (error: any) {
                                getLogger().error(
                                    `JSON parse error: ${error.message} for toolUseInput: ${toolUseInput}`
                                )
                                // set toolUse.input to be empty valid json object
                                toolUse.input = {}
                                error.message = `tooluse input is invalid: ${toolUseInput}`
                                // throw it out to allow the error to be handled in the catch block
                                throw error
                            }
                            const availableToolsNames = (session.pairProgrammingModeOn ? tools : noWriteTools).map(
                                (item) => item.toolSpecification?.name
                            )
                            if (!availableToolsNames.includes(toolUse.name)) {
                                throw new Error(`Tool ${toolUse.name} is not available in the current mode`)
                            }
                            const tool = ToolUtils.tryFromToolUse(toolUse)
                            if ('type' in tool) {
                                let explanation: string | undefined = undefined
                                let changeList: Change[] | undefined = undefined
                                let messageIdToUpdate: string | undefined = undefined
                                const isReadOrList: boolean = [ToolType.FsRead, ToolType.ListDirectory].includes(
                                    tool.type
                                )
                                if (tool.type === ToolType.ExecuteBash) {
                                    const input = toolUse.input as unknown as ExecuteBashParams
                                    if (input.explanation) {
                                        getLogger().debug(
                                            'Tool explanation: %s for executeBash toolUseId: %s',
                                            input.explanation,
                                            toolUse.toolUseId
                                        )
                                        explanation = input.explanation
                                    }
                                } else if (tool.type === ToolType.FsWrite) {
                                    const input = toolUse.input as unknown as FsWriteParams
                                    if (input.explanation) {
                                        getLogger().debug(
                                            'Tool explanation: %s for fsWrite toolUseId: %s',
                                            input.explanation,
                                            toolUse.toolUseId
                                        )
                                        explanation = input.explanation
                                    }
                                    session.setShowDiffOnFileWrite(true)
                                    changeList = await tool.tool.getDiffChanges()
                                }
                                if (tool.type === ToolType.FsRead) {
                                    messageIdToUpdate = session.messageIdToUpdate
                                    const input = toolUse.input as unknown as FsReadParams
                                    // Check if this file path is already in the readFiles list
                                    const isFileAlreadyRead = session.readFiles.some(
                                        (file) => file.relativeFilePath === input.path
                                    )
                                    if (!isFileAlreadyRead) {
                                        session.addToReadFiles({
                                            relativeFilePath: input?.path,
                                            lineRanges: [{ first: -1, second: -1 }],
                                        })
                                    }
                                } else if (tool.type === ToolType.ListDirectory) {
                                    messageIdToUpdate = session.messageIdToUpdateListDirectory
                                    const input = toolUse.input as unknown as ListDirectoryParams
                                    // Check if this folder is already in the readFolders list
                                    const isFolderAlreadyRead = session.readFolders.some(
                                        (folder) => folder.relativeFilePath === input.path
                                    )
                                    if (!isFolderAlreadyRead) {
                                        session.setReadFolders({
                                            relativeFilePath: input?.path,
                                            lineRanges: [{ first: -1, second: -1 }],
                                        })
                                    }
                                }
                                const validation = ToolUtils.requiresAcceptance(tool)
                                const chatStream = new ChatStream(
                                    this,
                                    tabID,
                                    triggerID,
                                    toolUse,
                                    session,
                                    messageIdToUpdate,
                                    true,
                                    validation,
                                    isReadOrList,
                                    changeList,
                                    explanation
                                )
                                await ToolUtils.queueDescription(
                                    tool,
                                    chatStream,
                                    chatStream.validation.requiresAcceptance
                                )
                                if (session.messageIdToUpdate === undefined && tool.type === ToolType.FsRead) {
                                    // Store the first messageId in a chain of tool uses
                                    session.setMessageIdToUpdate(toolUse.toolUseId)
                                }
                                if (
                                    session.messageIdToUpdateListDirectory === undefined &&
                                    tool.type === ToolType.ListDirectory
                                ) {
                                    session.setMessageIdToUpdateListDirectory(toolUse.toolUseId)
                                }
                                getLogger().debug(
                                    `SetToolUseWithError: ${toolUse.name}:${toolUse.toolUseId} with no error`
                                )
                                session.setToolUseWithError({ toolUse, error: undefined })
                                if (!validation.requiresAcceptance) {
                                    // Need separate id for read tool and safe bash command execution as 'run-shell-command' id is required to state in cwChatConnector.ts which will impact generic tool execution.
                                    if (tool.type === ToolType.ExecuteBash) {
                                        if (this.isTriggerCancelled(triggerID)) {
                                            return
                                        }
                                        this.dispatcher.sendCustomFormActionMessage(
                                            new CustomFormActionMessage(
                                                tabID,
                                                {
                                                    id: 'run-shell-command',
                                                },
                                                triggerID
                                            )
                                        )
                                    } else {
                                        if (this.isTriggerCancelled(triggerID)) {
                                            return
                                        }
                                        this.dispatcher.sendCustomFormActionMessage(
                                            new CustomFormActionMessage(
                                                tabID,
                                                {
                                                    id: 'generic-tool-execution',
                                                },
                                                triggerID
                                            )
                                        )
                                    }
                                } else {
                                    if (tool.type === ToolType.ExecuteBash) {
                                        this.telemetryHelper.recordInteractionWithAgenticChat(
                                            AgenticChatInteractionType.GeneratedCommand,
                                            { tabID }
                                        )
                                    }
                                }

                                if (tool.type === ToolType.FsWrite) {
                                    this.telemetryHelper.recordInteractionWithAgenticChat(
                                        AgenticChatInteractionType.GeneratedDiff,
                                        { tabID }
                                    )
                                }
                            } else {
                                throw new Error('Tool not found')
                            }
                        } catch (error: any) {
                            getLogger().error(
                                `toolUseId: ${toolUse.toolUseId}, toolUseName: ${toolUse.name}, error: ${error}`
                            )
                            session.setToolUseWithError({ toolUse, error })
                            // trigger processToolUseMessage to handle the error
                            this.dispatcher.sendCustomFormActionMessage(
                                new CustomFormActionMessage(
                                    tabID,
                                    {
                                        id: 'generic-tool-execution',
                                    },
                                    triggerID
                                )
                            )
                        }
                        // TODO: Add a spinner component for fsWrite, previous implementation is causing lag in mynah UX.
                    }

                    if (
                        chatEvent.assistantResponseEvent?.content !== undefined &&
                        chatEvent.assistantResponseEvent.content.length > 0
                    ) {
                        message += chatEvent.assistantResponseEvent.content
                        if (codeBlockLanguage === 'plaintext') {
                            codeBlockLanguage = extractCodeBlockLanguage(message)
                        }
                        // Check if this trigger has been cancelled
                        if (this.isTriggerCancelled(triggerID)) {
                            return
                        }

                        this.dispatcher.sendChatMessage(
                            new ChatMessage(
                                {
                                    message: message,
                                    messageType: 'answer-part',
                                    followUps: undefined,
                                    followUpsHeader: undefined,
                                    relatedSuggestions: undefined,
                                    codeReference,
                                    triggerID,
                                    messageID,
                                    userIntent: triggerPayload.userIntent,
                                    codeBlockLanguage: codeBlockLanguage,
                                    contextList: undefined,
                                },
                                tabID
                            )
                        )
                        this.telemetryHelper.setResponseStreamTimeForChunks(tabID)
                    }

                    if (chatEvent.supplementaryWebLinksEvent?.supplementaryWebLinks !== undefined) {
                        let suggestionIndex = 0
                        const newSuggestions: Suggestion[] =
                            chatEvent.supplementaryWebLinksEvent.supplementaryWebLinks.map(
                                (s: SupplementaryWebLink) =>
                                    new Suggestion({
                                        title: s.title ?? '',
                                        url: s.url ?? '',
                                        body: s.snippet ?? '',
                                        id: suggestionIndex++,
                                        context: [],
                                    })
                            )
                        relatedSuggestions.push(...newSuggestions)
                    }

                    if (chatEvent.followupPromptEvent?.followupPrompt !== undefined) {
                        const followUp = chatEvent.followupPromptEvent.followupPrompt
                        followUps.push({
                            type: followUp.userIntent ?? '',
                            pillText: followUp.content ?? '',
                            prompt: followUp.content ?? '',
                        })
                    }
                }
                return true
            },
            timeout,
            {
                cancellationCondition: () => this.isTriggerCancelled(triggerID),
            }
        )
            .catch((error: any) => {
                const errorInfo = extractErrorInfo(error)
                this.showChatExceptionMessage(
                    {
                        errorMessage: errorInfo.errorMessage,
                        statusCode: errorInfo.statusCode?.toString(),
                        sessionID: undefined,
                    },
                    tabID,
                    errorInfo.requestId
                )
                getLogger().error(`error: ${errorInfo.errorMessage} tabID: ${tabID} requestID: ${errorInfo.requestId}`)

                followUps = []
                relatedSuggestions = []
                this.telemetryHelper.recordMessageResponseError(triggerPayload, tabID, errorInfo.statusCode ?? 0)
            })
            .finally(async () => {
                if (session.sessionIdentifier && !this.isTriggerCancelled(triggerID)) {
                    this.chatHistoryDb.addMessage(tabID, 'cwc', session.sessionIdentifier, {
                        body: message,
                        type: 'answer' as any,
                        codeReference: codeReference as any,
                        relatedContent: { title: 'Sources', content: relatedSuggestions as any },
                        messageId: messageID,
                        toolUses:
                            toolUse && toolUse.input !== undefined && toolUse.input !== ''
                                ? [{ ...toolUse }]
                                : undefined,
                    })
                }
                if (
                    triggerPayload.relevantTextDocuments &&
                    triggerPayload.relevantTextDocuments.length > 0 &&
                    LspController.instance.isIndexingInProgress()
                ) {
                    this.dispatcher.sendChatMessage(
                        new ChatMessage(
                            {
                                message:
                                    message +
                                    ` \n\nBy the way, I'm still indexing this project for full context from your workspace. I may have a better response in a few minutes when it's complete if you'd like to try again then.`,
                                messageType: 'answer-part',
                                followUps: undefined,
                                followUpsHeader: undefined,
                                relatedSuggestions: undefined,
                                triggerID,
                                messageID,
                                userIntent: triggerPayload.userIntent,
                                codeBlockLanguage: codeBlockLanguage,
                                contextList: undefined,
                            },
                            tabID
                        )
                    )
                }

                if (relatedSuggestions.length !== 0) {
                    this.dispatcher.sendChatMessage(
                        new ChatMessage(
                            {
                                message: undefined,
                                messageType: 'answer-part',
                                followUpsHeader: undefined,
                                followUps: undefined,
                                relatedSuggestions,
                                triggerID,
                                messageID,
                                userIntent: triggerPayload.userIntent,
                                codeBlockLanguage: undefined,
                                contextList: undefined,
                            },
                            tabID
                        )
                    )
                }

                // Check if this trigger has been cancelled before sending final message
                if (this.isTriggerCancelled(triggerID)) {
                    return
                }

                if (!eventCounts.has('toolUseEvent')) {
                    session.setAgenticLoopInProgress(false)
                    session.setContext(undefined)

                    // Mark the trigger as completed when the agentic loop ends
                    conversationTracker.markTriggerCompleted(triggerID)
                }

                this.dispatcher.sendChatMessage(
                    new ChatMessage(
                        {
                            message: undefined,
                            messageType: !session.agenticLoopInProgress ? 'answer' : 'answer-stream',
                            followUps: followUps,
                            followUpsHeader: undefined,
                            relatedSuggestions: undefined,
                            triggerID,
                            messageID,
                            userIntent: triggerPayload.userIntent,
                            codeBlockLanguage: undefined,
                            contextList: undefined,
                        },
                        tabID
                    )
                )
                getLogger().info(
                    `All events received. requestId=%s counts=%s`,
                    response.$metadata.requestId,
                    Object.fromEntries(eventCounts)
                )

                this.telemetryHelper.setResponseStreamTotalTime(tabID)

                const responseCode = response?.$metadata.httpStatusCode ?? 0
                this.telemetryHelper.recordAddMessage(triggerPayload, {
                    followUpCount: followUps.length,
                    suggestionCount: relatedSuggestions.length,
                    tabID: tabID,
                    messageLength: message.length,
                    messageID,
                    responseCode,
                    codeReferenceCount: codeReference.length,
                    totalNumberOfCodeBlocksInResponse: await this.countTotalNumberOfCodeBlocks(message),
                })
            })
    }

    public sendInitialToolMessage(tabID: string, triggerID: string, toolUseId: string | undefined) {
        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message: '',
                    messageType: 'answer',
                    followUps: undefined,
                    followUpsHeader: undefined,
                    relatedSuggestions: undefined,
                    triggerID,
                    messageID: toolUseId ?? 'toolUse',
                    userIntent: undefined,
                    codeBlockLanguage: undefined,
                    contextList: undefined,
                },
                tabID
            )
        )
    }

    public sendErrorMessage(
        errorMessage: string | undefined,
        tabID: string,
        requestID: string | undefined,
        statusCode?: number
    ) {
        this.showChatExceptionMessage(
            {
                errorMessage: errorMessage,
                sessionID: undefined,
                statusCode: statusCode?.toString(),
            },
            tabID,
            requestID
        )
    }

    private sendReadAndListDirToolMessage(
        toolUse: ToolUse,
        session: ChatSession,
        tabID: string,
        triggerID: string,
        messageIdToUpdate?: string
    ) {
        const contextList = toolUse.name === ToolType.ListDirectory ? session.readFolders : session.readFiles
        const isFileRead = toolUse.name === ToolType.FsRead
        const items = isFileRead ? session.readFiles : session.readFolders
        const itemCount = items.length

        const title =
            itemCount < 1
                ? 'Gathering context'
                : isFileRead
                  ? `${itemCount} file${itemCount > 1 ? 's' : ''} read`
                  : `${itemCount} ${itemCount === 1 ? 'directory' : 'directories'} listed`

        this.dispatcher.sendToolMessage(
            new ToolMessage(
                {
                    message: '',
                    messageType: 'answer-part',
                    followUps: undefined,
                    followUpsHeader: undefined,
                    relatedSuggestions: undefined,
                    triggerID,
                    messageID: messageIdToUpdate ?? toolUse?.toolUseId ?? '',
                    userIntent: undefined,
                    codeBlockLanguage: undefined,
                    contextList,
                    canBeVoted: false,
                    buttons: undefined,
                    fullWidth: false,
                    padding: false,
                    codeBlockActions: undefined,
                    rootFolderTitle: title,
                },
                tabID
            )
        )
    }

    public sendPartialToolLog(
        message: string,
        tabID: string,
        triggerID: string,
        toolUse: ToolUse | undefined,
        session: ChatSession,
        messageIdToUpdate: string | undefined,
        validation: CommandValidation,
        changeList?: Change[]
    ) {
        if (this.isTriggerCancelled(triggerID)) {
            return
        }

        // Handle read tool and list directory messages
        if (
            (toolUse?.name === ToolType.FsRead || toolUse?.name === ToolType.ListDirectory) &&
            !validation.requiresAcceptance
        ) {
            return this.sendReadAndListDirToolMessage(toolUse, session, tabID, triggerID, messageIdToUpdate)
        }

        // Handle file write tool, execute bash tool and bash command output log messages
        const buttons: ChatItemButton[] = []
        let header: ChatItemHeader | undefined = undefined
        let messageID: string = toolUse?.toolUseId ?? ''
        if (toolUse?.name === ToolType.ExecuteBash && message.startsWith('```shell')) {
            if (validation.requiresAcceptance) {
                const buttons: ChatItemButton[] = [
                    {
                        id: 'reject-shell-command',
                        text: localize('AWS.generic.reject', 'Reject'),
                        status: 'clear',
                        icon: 'cancel' as MynahIconsType,
                    },
                    {
                        id: 'run-shell-command',
                        text: localize('AWS.generic.run', 'Run'),
                        status: 'clear',
                        icon: 'play' as MynahIconsType,
                    },
                ]
                header = {
                    body: 'shell',
                    buttons,
                }
            }
            if (validation.warning) {
                message = validation.warning + message
            }
        } else if (toolUse?.name === ToolType.FsWrite) {
            if (this.isTriggerCancelled(triggerID)) {
                return
            }
            const input = toolUse.input as unknown as FsWriteParams
            const fileName = path.basename(input.path)
            const changes = getDiffLinesFromChanges(changeList)
            const fileList: ChatItemContent['fileList'] = {
                fileTreeTitle: '',
                hideFileCount: true,
                filePaths: [fileName],
                details: {
                    [fileName]: {
                        // eslint-disable-next-line unicorn/no-null
                        icon: null,
                        changes: changes,
                    },
                },
            }
            const buttons: ChatItemButton[] = [
                {
                    id: 'reject-code-diff',
                    status: 'clear',
                    icon: 'cancel' as MynahIconsType,
                },
            ]
            const status: {
                icon?: MynahIcons | MynahIconsType
                status?: {
                    status?: Status
                    icon?: MynahIcons | MynahIconsType
                    text?: string
                }
            } = {
                status: {
                    text: 'Accepted',
                    status: 'success',
                },
            }
            header = {
                buttons,
                ...status,
                fileList,
            }
        } else if (toolUse?.name === ToolType.ListDirectory || toolUse?.name === ToolType.FsRead) {
            if (validation.requiresAcceptance) {
                messageID = 'toolUse'
                const buttons: ChatItemButton[] = [
                    {
                        id: 'confirm-tool-use',
                        text: localize('AWS.generic.run', 'Run'),
                        status: 'clear',
                        icon: 'play' as MynahIconsType,
                    },
                    {
                        id: 'reject-tool-use',
                        text: localize('AWS.generic.reject', 'Reject'),
                        status: 'clear',
                        icon: 'cancel' as MynahIconsType,
                    },
                ]
                header = {
                    buttons,
                }
            }
        }

        if (this.isTriggerCancelled(triggerID)) {
            return
        }

        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message: message,
                    messageType: 'answer-part',
                    followUps: undefined,
                    followUpsHeader: undefined,
                    relatedSuggestions: undefined,
                    triggerID,
                    messageID,
                    userIntent: undefined,
                    codeBlockLanguage: undefined,
                    contextList: undefined,
                    title: undefined,
                    canBeVoted: false,
                    buttons,
                    fullWidth: true,
                    padding: false,
                    header,
                    // eslint-disable-next-line unicorn/no-null
                    codeBlockActions: { 'insert-to-cursor': null, copy: null },
                },
                tabID
            )
        )
    }

    private editorContextMenuCommandVerbs: Map<EditorContextCommandType, string> = new Map([
        ['aws.amazonq.explainCode', 'Explain'],
        ['aws.amazonq.explainIssue', 'Explain'],
        ['aws.amazonq.refactorCode', 'Refactor'],
        ['aws.amazonq.fixCode', 'Fix'],
        ['aws.amazonq.optimizeCode', 'Optimize'],
        ['aws.amazonq.sendToPrompt', 'Send to prompt'],
        ['aws.amazonq.generateUnitTests', 'Generate unit tests for'],
    ])

    public sendStaticTextResponse(type: StaticTextResponseType, triggerID: string, tabID: string) {
        // Check if the conversation has been cancelled
        if (this.isTriggerCancelled(triggerID)) {
            getLogger().debug(`Static text response sending cancelled for tabID: ${tabID}, triggerID: ${triggerID}`)
            return
        }

        let message
        let followUps
        let followUpsHeader
        switch (type) {
            case 'quick-action-help':
                message = helpMessage
                break
            case 'onboarding-help':
                message = `### What I can do:
                \n\n- Answer questions about AWS
                \n\n- Answer questions about general programming concepts
                \n\n- Explain what a line of code or code function does
                \n\n- Write unit tests and code
                \n\n- Debug and fix code
                \n\n- Refactor code`
                followUps = [
                    {
                        type: '',
                        pillText: 'Should I use AWS Lambda or EC2 for a scalable web application backend?',
                        prompt: 'Should I use AWS Lambda or EC2 for a scalable web application backend?',
                    },
                    {
                        type: '',
                        pillText: 'What is the syntax of declaring a variable in TypeScript?',
                        prompt: 'What is the syntax of declaring a variable in TypeScript?',
                    },
                    {
                        type: '',
                        pillText: 'Write code for uploading a file to an s3 bucket in typescript',
                        prompt: 'Write code for uploading a file to an s3 bucket in typescript',
                    },
                ]
                followUpsHeader = 'Try Examples:'
                break
        }

        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message,
                    messageType: 'answer',
                    followUpsHeader,
                    followUps,
                    relatedSuggestions: undefined,
                    triggerID,
                    messageID: 'static_message_' + triggerID,
                    userIntent: undefined,
                    codeBlockLanguage: undefined,
                    contextList: undefined,
                    title: undefined,
                },
                tabID
            )
        )
    }

    public sendQuickActionMessage(quickAction: ChatPromptCommandType, triggerID: string) {
        let message = ''
        switch (quickAction) {
            case 'help':
                message = 'How can Amazon Q help me?'
                break
        }

        this.dispatcher.sendQuickActionMessage(
            new QuickActionMessage({
                message,
                triggerID,
            })
        )
    }

    public sendEditorContextCommandMessage(
        command: EditorContextCommandType,
        selectedCode: string,
        triggerID: string,
        issue?: CodeScanIssue
    ) {
        // Remove newlines and spaces before and after the code
        const trimmedCode = selectedCode.trimStart().trimEnd()

        let message
        if (command === 'aws.amazonq.sendToPrompt') {
            message = ['\n```\n', trimmedCode, '\n```'].join('')
        } else if (command === 'aws.amazonq.explainIssue' && issue) {
            message = [
                this.editorContextMenuCommandVerbs.get(command),
                ` the "${issue.title}" issue in the following code:`,
                '\n```\n',
                trimmedCode,
                '\n```',
            ].join('')
        } else {
            message = [
                this.editorContextMenuCommandVerbs.get(command),
                ' the following part of my code:',
                '\n```\n',
                trimmedCode,
                '\n```',
            ].join('')
        }

        this.dispatcher.sendEditorContextCommandMessage(
            new EditorContextCommandMessage({ message, triggerID, command })
        )
    }

    private showChatExceptionMessage(e: ChatException, tabID: string, requestID: string | undefined) {
        const title = 'An error occurred while processing your request.'
        // TODO: once the server sends the correct exception back, fix this
        if (e.statusCode && e.statusCode === '500') {
            // Send throttling message
            this.dispatcher.sendErrorMessage(
                new ErrorMessage(
                    title,
                    'We are experiencing heavy traffic, please try again shortly.'.trimEnd().trimStart(),
                    tabID
                )
            )
            return
        }

        let message = 'This error is reported to the team automatically. We will attempt to fix it as soon as possible.'
        if (e.errorMessage !== undefined) {
            message += `\n\nDetails: ${e.errorMessage}`
        }

        if (e.statusCode !== undefined) {
            message += `\n\nStatus Code: ${e.statusCode}`
        }
        if (e.sessionID !== undefined) {
            message += `\n\nSession ID: ${e.sessionID}`
        }
        if (requestID !== undefined) {
            message += `\n\nRequest ID: ${requestID}`
        }

        this.dispatcher.sendErrorMessage(new ErrorMessage(title, message.trimEnd().trimStart(), tabID))
    }

    public sendOpenSettingsMessage(triggerId: string, tabID: string) {
        this.dispatcher.sendOpenSettingsMessage(new OpenSettingsMessage(tabID))
    }

    public sendRestoreTabMessage(historyId: string, tabType: TabType, chats: ChatItem[], exportTab?: boolean) {
        this.dispatcher.sendRestoreTabMessage(new RestoreTabMessage(historyId, tabType, chats, exportTab))
    }

    public sendOpenDetailedListMessage(tabId: string, listType: string, data: DetailedList) {
        this.dispatcher.sendOpenDetailedListMessage(new OpenDetailedListMessage(tabId, listType, data))
    }

    public sendUpdateDetailedListMessage(listType: string, data: DetailedList) {
        this.dispatcher.sendUpdateDetailedListMessage(new UpdateDetailedListMessage(listType, data))
    }

    public sendCloseDetailedListMessage(listType: string) {
        this.dispatcher.sendCloseDetailedListMessage(new CloseDetailedListMessage(listType))
    }

    public sendSerializeTabMessage(tabId: string, uri: string, format: 'html' | 'markdown') {
        this.dispatcher.sendSerializeTabMessage(new ExportChatMessage(tabId, format, uri))
    }

    public sendSelectTabMessage(tabId: string, eventID?: string) {
        this.dispatcher.sendSelectTabMessage(new SelectTabMessage(tabId, eventID))
    }

    public sendContextCommandData(contextCommands: MynahUIDataModel['contextCommands']) {
        this.dispatcher.sendContextCommandData(new ContextCommandData(contextCommands))
    }

    public showCustomForm(
        tabID: string,
        formItems?: ChatItemFormItem[],
        buttons?: ChatItemButton[],
        title?: string,
        description?: string
    ) {
        this.dispatcher.sendShowCustomFormMessage(
            new ShowCustomFormMessage(tabID, formItems, buttons, title, description)
        )
    }

    public sendAsyncEventProgress(tabID: string, inProgress: boolean, message: string | undefined) {
        this.dispatcher.sendAsyncEventProgress(new AsyncEventProgressMessage(tabID, 'CWChat', inProgress, message))
    }

    public sendEmptyMessage(
        tabID: string,
        triggerId: string,
        mergedRelevantDocuments: DocumentReference[] | undefined
    ) {
        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message: '',
                    messageType: 'answer',
                    followUps: undefined,
                    followUpsHeader: undefined,
                    relatedSuggestions: undefined,
                    triggerID: triggerId,
                    messageID: '',
                    userIntent: undefined,
                    codeBlockLanguage: undefined,
                    contextList: undefined,
                },
                tabID
            )
        )
    }

    public sendDirectiveMessage(tabID: string, triggerID: string, message: string) {
        this.dispatcher.sendChatMessage(
            new ChatMessage(
                {
                    message,
                    messageType: 'directive',
                    followUps: undefined,
                    followUpsHeader: undefined,
                    relatedSuggestions: undefined,
                    triggerID,
                    messageID: '',
                    userIntent: undefined,
                    codeBlockLanguage: undefined,
                    contextList: undefined,
                },
                tabID
            )
        )
    }

    /**
     * Check if a trigger has been cancelled and should not proceed
     * @param triggerId The trigger ID to check
     * @returns true if the trigger is cancelled and should not proceed
     */
    private isTriggerCancelled(triggerId: string): boolean {
        if (!triggerId) {
            return false
        }
        const conversationTracker = ConversationTracker.getInstance()
        return conversationTracker.isTriggerCancelled(triggerId)
    }
}
