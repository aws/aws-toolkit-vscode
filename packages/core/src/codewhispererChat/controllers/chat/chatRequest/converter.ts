/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ConversationState,
    CursorState,
    DocumentSymbol,
    EnvState,
    RelevantTextDocument,
    ShellState,
    SymbolType,
    TextDocument,
    Tool,
} from '@amzn/codewhisperer-streaming'
import { ChatTriggerType, TriggerPayload } from '../model'
import { undefinedIfEmpty } from '../../../../shared/utilities/textUtilities'
import { tryGetCurrentWorkingDirectory } from '../../../../shared/utilities/workspaceUtils'
import toolsJson from '../../../tools/tool_index.json'
import { getOperatingSystem } from '../../../../shared/telemetry/util'

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

interface ToolSpec {
    name: string
    description: string
    // eslint-disable-next-line @typescript-eslint/naming-convention
    input_schema: Record<string, any>
    [key: string]: any
}

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

    const tools: Tool[] = Object.entries(toolsJson as Record<string, ToolSpec>).map(([toolName, toolSpec]) => ({
        toolSpecification: {
            ...toolSpec,
            // Use the key as name if not already defined in the spec
            name: toolSpec.name || toolName,
            inputSchema: { json: toolSpec.input_schema },
        },
    }))

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
                        envState: buildEnvState(),
                        shellState: buildShellState(),
                        additionalContext: triggerPayload.additionalContents,
                        tools,
                        ...(triggerPayload.toolResults !== undefined &&
                            triggerPayload.toolResults !== null && { toolResults: triggerPayload.toolResults }),
                    },
                    userIntent: triggerPayload.userIntent,
                    ...(triggerPayload.origin !== undefined &&
                        triggerPayload.origin !== null && { origin: triggerPayload.origin }),
                },
            },
            chatTriggerType,
            customizationArn: customizationArn,
            history: triggerPayload.chatHistory,
        },
    }
}

/**
 * Helper function to build environment state
 */
export function buildEnvState(): EnvState {
    return {
        operatingSystem: getOperatingSystem(),
        currentWorkingDirectory: tryGetCurrentWorkingDirectory(),
    }
}

/**
 * Helper function to build shell state
 */
export function buildShellState(): ShellState {
    // In a real implementation, you would detect the shell
    // This is a simplified version
    const shellName = process.env.SHELL || 'bash'
    return {
        shellName: shellName.split('/').pop() || 'bash',
        shellHistory: undefined,
    }
}
