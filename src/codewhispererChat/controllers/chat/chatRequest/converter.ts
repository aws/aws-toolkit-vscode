/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    CursorState,
    DocumentSymbol,
    GenerateAssistantResponseRequest,
    SymbolType,
    TextDocument,
} from '@amzn/codewhisperer-streaming'
import { TriggerPayload } from '../model'

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

export function triggerPayloadToChatRequest(triggerPayload: TriggerPayload): GenerateAssistantResponseRequest {
    let document: TextDocument | undefined = undefined
    let cursorState: CursorState | undefined = undefined

    if (triggerPayload.filePath !== undefined && triggerPayload.filePath !== '') {
        const documentSymbolFqns: DocumentSymbol[] = []
        triggerPayload.codeQuery?.fullyQualifiedNames?.used?.forEach(fqn => {
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
        })

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
                        },
                    },
                    userIntent: triggerPayload.userIntent,
                },
            },
            chatTriggerType: 'MANUAL',
        },
    }
}
