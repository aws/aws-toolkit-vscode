/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ConversationState,
    CursorState,
    DocumentSymbol,
    SymbolType,
    TextDocument,
    ChatMessage,
} from '@amzn/codewhisperer-streaming'
import { AdditionalContentEntryAddition, ChatTriggerType, RelevantTextDocumentAddition, TriggerPayload } from '../model'
import { undefinedIfEmpty } from '../../../../shared/utilities/textUtilities'
import { ChatItemType } from '../../../../amazonq/commons/model'
import { getLogger } from '../../../../shared/logger/logger'

const fqnNameSizeDownLimit = 1
const fqnNameSizeUpLimit = 256
export const supportedLanguagesList = [
    'python',
    'javascript',
    'java',
    'csharp',
    'typescript',
    'c',
    'cpp',
    'go',
    'kotlin',
    'php',
    'ruby',
    'rust',
    'scala',
    'shell',
    'sql',
]

export const filePathSizeLimit = 4_000

export function triggerPayloadToChatRequest(triggerPayload: TriggerPayload): { conversationState: ConversationState } {
    // Flexible truncation logic
    const remainingPayloadSize = 100_000

    // Type A context: Preserving user input as much as possible
    const userInputTruncationInfo = preserveContexts(triggerPayload, remainingPayloadSize, ChatContextType.UserInput)

    // Type B1(prompts) context: Preserving @prompt as much as possible
    const userSpecificPromptsTruncationInfo = preserveContexts(
        triggerPayload,
        userInputTruncationInfo.remainingPayloadSize,
        ChatContextType.UserSpecificPrompts
    )

    // Type C context: Preserving current file context as much as possible
    const currentFileTruncationInfo = preserveContexts(
        triggerPayload,
        userSpecificPromptsTruncationInfo.remainingPayloadSize,
        ChatContextType.CurrentFile
    )

    // Type B1(rules) context: Preserving rules as much as possible
    const userSpecificRulesTruncationInfo = preserveContexts(
        triggerPayload,
        currentFileTruncationInfo.remainingPayloadSize,
        ChatContextType.UserSpecificRules
    )

    // Type B2(explicit @files) context: Preserving files as much as possible
    const userSpecificFilesTruncationInfo = preserveContexts(
        triggerPayload,
        userSpecificRulesTruncationInfo.remainingPayloadSize,
        ChatContextType.UserSpecificFiles
    )

    // Type B3 @workspace context: Preserving workspace as much as possible
    const workspaceTruncationInfo = preserveContexts(
        triggerPayload,
        userSpecificFilesTruncationInfo.remainingPayloadSize,
        ChatContextType.Workspace
    )

    getLogger().debug(
        `current request total payload size: ${userInputTruncationInfo.sizeAfter + currentFileTruncationInfo.sizeAfter + userSpecificRulesTruncationInfo.sizeAfter + userSpecificFilesTruncationInfo.sizeAfter + workspaceTruncationInfo.sizeAfter}`
    )

    // Filter out empty innerContext from additionalContents
    if (triggerPayload.additionalContents !== undefined) {
        triggerPayload.additionalContents = triggerPayload.additionalContents.filter(
            (content) => content.innerContext !== undefined && content.innerContext !== ''
        )
    }

    // Filter out empty text from relevantTextDocuments
    triggerPayload.relevantTextDocuments = triggerPayload.relevantTextDocuments.filter(
        (doc) => doc.text !== undefined && doc.text !== ''
    )

    let document: TextDocument | undefined = undefined
    let cursorState: CursorState | undefined = undefined

    if (triggerPayload.filePath !== undefined && triggerPayload.filePath !== '') {
        const documentSymbolFqns: DocumentSymbol[] = []
        if (triggerPayload.codeQuery?.fullyQualifiedNames?.used) {
            for (const fqn of triggerPayload.codeQuery.fullyQualifiedNames.used) {
                const elem = {
                    name: fqn.symbol?.join('.') ?? '',
                    type: SymbolType.USAGE,
                    source: fqn.source?.join('.'),
                }

                if (
                    elem.name.length >= fqnNameSizeDownLimit &&
                    elem.name.length < fqnNameSizeUpLimit &&
                    (elem.source === undefined ||
                        (elem.source.length >= fqnNameSizeDownLimit && elem.source.length < fqnNameSizeUpLimit))
                ) {
                    documentSymbolFqns.push(elem)
                }
            }
        }

        let programmingLanguage
        if (
            triggerPayload.fileLanguage !== undefined &&
            triggerPayload.fileLanguage !== '' &&
            supportedLanguagesList.includes(triggerPayload.fileLanguage)
        ) {
            programmingLanguage = { languageName: triggerPayload.fileLanguage }
        }

        document = {
            relativeFilePath: triggerPayload.filePath ? triggerPayload.filePath.substring(0, filePathSizeLimit) : '',
            text: triggerPayload.fileText,
            programmingLanguage: programmingLanguage,
            documentSymbols: documentSymbolFqns,
        }

        if (triggerPayload.codeSelection?.start) {
            cursorState = {
                range: {
                    start: {
                        line: triggerPayload.codeSelection.start.line,
                        character: triggerPayload.codeSelection.start.character,
                    },
                    end: {
                        line: triggerPayload.codeSelection.end.line,
                        character: triggerPayload.codeSelection.end.character,
                    },
                },
            }
        }
    }

    // service will throw validation exception if string is empty
    const customizationArn: string | undefined = undefinedIfEmpty(triggerPayload.customization.arn)
    const chatTriggerType = triggerPayload.trigger === ChatTriggerType.InlineChatMessage ? 'INLINE_CHAT' : 'MANUAL'
    const history =
        triggerPayload.history &&
        triggerPayload.history.length > 0 &&
        (triggerPayload.history.map((chat) =>
            chat.type === ('answer' as ChatItemType)
                ? {
                      assistantResponseMessage: {
                          content: chat.body,
                      },
                  }
                : {
                      userInputMessage: {
                          content: chat.body,
                      },
                  }
        ) as ChatMessage[])

    return {
        conversationState: {
            currentMessage: {
                userInputMessage: {
                    content: triggerPayload.message,
                    userInputMessageContext: {
                        editorState: {
                            document,
                            cursorState,
                            relevantDocuments: triggerPayload.relevantTextDocuments,
                            useRelevantDocuments: triggerPayload.useRelevantDocuments,
                        },
                        additionalContext: triggerPayload.additionalContents,
                    },
                    userIntent: triggerPayload.userIntent,
                },
            },
            chatTriggerType,
            customizationArn: customizationArn,
            history: history || undefined,
        },
    }
}

function preserveContexts(
    triggerPayload: TriggerPayload,
    remainingPayloadSize: number,
    contextType: ChatContextType
): FlexibleTruncationInfo {
    const typeToContextMap = new Map<
        ChatContextType,
        string | AdditionalContentEntryAddition[] | RelevantTextDocumentAddition[]
    >([
        [ChatContextType.UserInput, triggerPayload.message],
        [ChatContextType.CurrentFile, triggerPayload.fileText],
        [ChatContextType.UserSpecificPrompts, triggerPayload.additionalContents],
        [ChatContextType.UserSpecificRules, triggerPayload.additionalContents],
        [ChatContextType.UserSpecificFiles, triggerPayload.additionalContents],
        [ChatContextType.Workspace, triggerPayload.relevantTextDocuments],
    ])

    let truncationInfo = {
        remainingPayloadSize: remainingPayloadSize,
        sizeBefore: 0,
        sizeAfter: 0,
        textAfter: '',
    }

    const contexts = typeToContextMap.get(contextType)
    switch (contextType) {
        case ChatContextType.UserInput:
            truncationInfo = truncate(contexts as string, truncationInfo)
            triggerPayload.message = truncationInfo.textAfter
            triggerPayload.contextLengths.truncatedUserInputContextLength = truncationInfo.sizeAfter
            break
        case ChatContextType.CurrentFile:
            truncationInfo = truncate(contexts as string, truncationInfo)
            triggerPayload.fileText = truncationInfo.textAfter
            triggerPayload.contextLengths.truncatedFocusFileContextLength = truncationInfo.sizeAfter
            break
        case ChatContextType.UserSpecificPrompts:
            truncationInfo = truncateUserSpecificContexts(
                contexts as AdditionalContentEntryAddition[],
                truncationInfo,
                'prompt'
            )
            triggerPayload.contextLengths.truncatedAdditionalContextLengths.promptContextLength =
                truncationInfo.sizeAfter
            break
        case ChatContextType.UserSpecificRules:
            truncationInfo = truncateUserSpecificContexts(
                contexts as AdditionalContentEntryAddition[],
                truncationInfo,
                'rule'
            )
            triggerPayload.contextLengths.truncatedAdditionalContextLengths.ruleContextLength = truncationInfo.sizeAfter
            break
        case ChatContextType.UserSpecificFiles:
            truncationInfo = truncateUserSpecificContexts(
                contexts as AdditionalContentEntryAddition[],
                truncationInfo,
                'file'
            )
            triggerPayload.contextLengths.truncatedAdditionalContextLengths.fileContextLength = truncationInfo.sizeAfter
            break
        case ChatContextType.Workspace:
            truncationInfo = truncateWorkspaceContexts(contexts as RelevantTextDocumentAddition[], truncationInfo)
            triggerPayload.contextLengths.truncatedWorkspaceContextLength = truncationInfo.sizeAfter
            break
        default:
            getLogger().warn(`Unexpected context type: ${contextType}`)
            return truncationInfo
    }

    getLogger().debug(
        `Current request context size: type: ${contextType}, before: ${truncationInfo.sizeBefore}, after: ${truncationInfo.sizeAfter}`
    )
    return truncationInfo
}

function truncateUserSpecificContexts(
    contexts: AdditionalContentEntryAddition[],
    truncationInfo: FlexibleTruncationInfo,
    type: string
): FlexibleTruncationInfo {
    for (const context of contexts) {
        if (context.type !== type || !context.innerContext) {
            continue
        }
        truncationInfo = truncate(context.innerContext, truncationInfo)
        context.innerContext = truncationInfo.textAfter
    }
    return truncationInfo
}

function truncateWorkspaceContexts(
    contexts: RelevantTextDocumentAddition[],
    truncationInfo: FlexibleTruncationInfo
): FlexibleTruncationInfo {
    for (const context of contexts) {
        if (!context.text) {
            continue
        }
        truncationInfo = truncate(context.text, truncationInfo)
        context.text = truncationInfo.textAfter
    }
    return truncationInfo
}

function truncate(
    textBefore: string,
    truncationInfo: FlexibleTruncationInfo,
    isCurrentFile: boolean = false
): FlexibleTruncationInfo {
    const sizeBefore = truncationInfo.sizeBefore + textBefore.length

    // for all other types of contexts, we simply truncate the tail,
    // for current file context, since it's expanded from the middle context, we truncate head and tail to preserve middle context
    const middle = Math.floor(textBefore.length / 2)
    const halfRemaining = Math.floor(truncationInfo.remainingPayloadSize / 2)
    const startPos = isCurrentFile ? middle - halfRemaining : 0
    const endPos = isCurrentFile
        ? middle + (truncationInfo.remainingPayloadSize - halfRemaining)
        : Math.min(textBefore.length, truncationInfo.remainingPayloadSize)
    const textAfter = textBefore.substring(startPos, endPos)

    const sizeAfter = truncationInfo.sizeAfter + textAfter.length
    const remainingPayloadSize = truncationInfo.remainingPayloadSize - textAfter.length
    return {
        remainingPayloadSize,
        sizeBefore,
        sizeAfter,
        textAfter,
    }
}

type FlexibleTruncationInfo = {
    readonly remainingPayloadSize: number
    readonly sizeBefore: number
    readonly sizeAfter: number
    readonly textAfter: string
}

export enum ChatContextType {
    UserInput = 'userInput',
    CurrentFile = 'currentFile',
    UserSpecificPrompts = 'userSpecificPrompts',
    UserSpecificRules = 'userSpecificRules',
    UserSpecificFiles = 'userSpecificFiles',
    Workspace = 'workspace',
}
