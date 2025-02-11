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
                    },
                    userIntent: triggerPayload.userIntent,
                },
            },
            chatTriggerType,
            customizationArn: customizationArn,
        },
    }
}
