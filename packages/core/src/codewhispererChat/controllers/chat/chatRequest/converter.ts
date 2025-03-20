/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ConversationState,
    CursorState,
    DocumentSymbol,
    RelevantTextDocument,
    SymbolType,
    TextDocument,
} from '@amzn/codewhisperer-streaming'
import { ChatTriggerType, TriggerPayload } from '../model'
import { undefinedIfEmpty } from '../../../../shared/utilities/textUtilities'
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

const filePathSizeLimit = 4_000
const customerMessageSizeLimit = 4_000

export function triggerPayloadToChatRequest(triggerPayload: TriggerPayload): { conversationState: ConversationState } {
    // truncate
    let remainingPayloadSize = 100_000
    // Type A context:  Preserving userInput as much as possible
    if (triggerPayload.message !== undefined) {
        if (triggerPayload.message.length <= remainingPayloadSize) {
            remainingPayloadSize -= triggerPayload.message.length
        } else {
            triggerPayload.message = triggerPayload.message.substring(0, remainingPayloadSize)
            remainingPayloadSize = 0
        }
    }
    // TODO: send truncation telemetry if needed
    getLogger().debug(`current request user input size: ${triggerPayload.message?.length}`)

    // Type B1(prompts) context: Preserving prompts as much as possible
    let totalPromptSize = 0
    if (triggerPayload.additionalContents !== undefined) {
        for (const additionalContent of triggerPayload.additionalContents) {
            if (additionalContent.type === 'prompt' && additionalContent.innerContext !== undefined) {
                if (additionalContent.innerContext.length <= remainingPayloadSize) {
                    remainingPayloadSize -= additionalContent.innerContext.length
                } else {
                    additionalContent.innerContext = additionalContent.innerContext.substring(0, remainingPayloadSize)
                    remainingPayloadSize = 0
                }
                totalPromptSize += additionalContent.innerContext.length
            }
        }
    }

    getLogger().debug(`current request total prompts size: ${totalPromptSize}`)

    // Type C context: Preserving current file context as much as possible
    // truncate the text to keep texts in the middle instead of blindly truncating the tail
    if (triggerPayload.fileText !== undefined) {
        if (triggerPayload.fileText.length <= remainingPayloadSize) {
            remainingPayloadSize -= triggerPayload.fileText.length
        } else {
            // Calculate the middle point
            const middle = Math.floor(triggerPayload.fileText.length / 2)
            // Calculate how much text we can take from each side of the middle
            const halfRemaining = Math.floor(remainingPayloadSize / 2)
            // Get text from around the middle point
            const startPos = middle - halfRemaining
            const endPos = middle + halfRemaining

            triggerPayload.fileText = triggerPayload.fileText.substring(startPos, endPos)
            remainingPayloadSize = 0
        }
    }
    getLogger().debug(`current request file content size: ${triggerPayload.fileText?.length}`)

    // Type B1(rules) context: Preserving rules as much as possible
    let totalRulesSize = 0
    if (triggerPayload.additionalContents !== undefined) {
        for (const additionalContent of triggerPayload.additionalContents) {
            if (additionalContent.type === 'rule' && additionalContent.innerContext !== undefined) {
                if (additionalContent.innerContext.length <= remainingPayloadSize) {
                    remainingPayloadSize -= additionalContent.innerContext.length
                } else {
                    additionalContent.innerContext = additionalContent.innerContext.substring(0, remainingPayloadSize)
                    remainingPayloadSize = 0
                }
                totalRulesSize += additionalContent.innerContext.length
            }
        }
    }

    getLogger().debug(`current request rules size: ${totalRulesSize}`)

    // Type B2(explicit @files) context: Preserving files as much as possible
    if (triggerPayload.additionalContents !== undefined) {
        for (const additionalContent of triggerPayload.additionalContents) {
            if (additionalContent.type === 'file' && additionalContent.innerContext !== undefined) {
                if (additionalContent.innerContext.length <= remainingPayloadSize) {
                    remainingPayloadSize -= additionalContent.innerContext.length
                } else {
                    additionalContent.innerContext = additionalContent.innerContext.substring(0, remainingPayloadSize)
                    remainingPayloadSize = 0
                }
            }
        }
    }

    // Type B3 @workspace context: Preserving workspace as much as possible
    let totalWorkspaceSize = 0
    if (triggerPayload.relevantTextDocuments !== undefined) {
        for (const relevantDocument of triggerPayload.relevantTextDocuments) {
            if (relevantDocument.text !== undefined) {
                if (relevantDocument.text.length <= remainingPayloadSize) {
                    // remainingPayloadSize -= relevantDocument.text.length
                } else {
                    // relevantDocument.text = relevantDocument.text.substring(0, remainingPayloadSize)
                    // remainingPayloadSize = 0
                }
                totalWorkspaceSize += relevantDocument.text.length
            }
        }
    }

    getLogger().debug(`current request workspace size: ${totalWorkspaceSize}`)

    getLogger().debug(
        `current request total payload size: ${(triggerPayload.message?.length ?? 0) + totalPromptSize + (triggerPayload.fileText?.length ?? 0) + totalRulesSize + totalWorkspaceSize}`
    )

    // Filter out empty innerContext from additionalContents
    if (triggerPayload.additionalContents !== undefined) {
        triggerPayload.additionalContents = triggerPayload.additionalContents.filter(
            (content) => content.innerContext !== undefined && content.innerContext !== ''
        )
    }

    // Filter out empty text from relevantTextDocuments
    if (triggerPayload.relevantTextDocuments !== undefined) {
        triggerPayload.relevantTextDocuments = triggerPayload.relevantTextDocuments.filter(
            (doc) => doc.text !== undefined && doc.text !== ''
        )
    }

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

    const relevantDocuments: RelevantTextDocument[] = triggerPayload.relevantTextDocuments
        ? triggerPayload.relevantTextDocuments
        : []
    const useRelevantDocuments = triggerPayload.useRelevantDocuments
    // service will throw validation exception if string is empty
    const customizationArn: string | undefined = undefinedIfEmpty(triggerPayload.customization.arn)
    const chatTriggerType = triggerPayload.trigger === ChatTriggerType.InlineChatMessage ? 'INLINE_CHAT' : 'MANUAL'

    return {
        conversationState: {
            currentMessage: {
                userInputMessage: {
                    content: triggerPayload.message
                        ? triggerPayload.message.substring(0, customerMessageSizeLimit)
                        : '',
                    userInputMessageContext: {
                        editorState: {
                            document,
                            cursorState,
                            relevantDocuments,
                            useRelevantDocuments,
                        },
                        additionalContext: triggerPayload.additionalContents,
                    },
                    userIntent: triggerPayload.userIntent,
                },
            },
            chatTriggerType,
            customizationArn: customizationArn,
        },
    }
}
