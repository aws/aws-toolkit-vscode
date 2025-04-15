/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import {
    ChatTriggerType,
    filePathSizeLimit,
    TriggerPayload,
    triggerPayloadToChatRequest,
} from 'aws-core-vscode/codewhispererChat'

describe('triggerPayloadToChatRequest', () => {
    const mockBasicPayload: TriggerPayload = {
        message: 'test message',
        filePath: 'test/path.ts',
        fileText: 'console.log("hello")',
        fileLanguage: 'typescript',
        additionalContents: [],
        relevantTextDocuments: [],
        useRelevantDocuments: false,
        customization: { arn: 'test:arn' },
        trigger: ChatTriggerType.ChatMessage,
        contextLengths: {
            truncatedUserInputContextLength: 0,
            truncatedFocusFileContextLength: 0,
            truncatedWorkspaceContextLength: 0,
            truncatedAdditionalContextLengths: {
                promptContextLength: 0,
                ruleContextLength: 0,
                fileContextLength: 0,
            },
            additionalContextLengths: {
                fileContextLength: 0,
                promptContextLength: 0,
                ruleContextLength: 0,
            },
            workspaceContextLength: 0,
            userInputContextLength: 0,
            focusFileContextLength: 0,
        },
        profile: undefined,
        context: [],
        documentReferences: [],
        query: undefined,
        codeSelection: undefined,
        matchPolicy: undefined,
        codeQuery: undefined,
        userIntent: undefined,
    }

    const createLargeString = (size: number, prefix: string = '') => prefix + 'x'.repeat(size - prefix.length)

    const createPrompt = (size: number) => {
        return {
            name: 'prompt',
            description: 'prompt',
            relativePath: 'path-prompt',
            type: 'prompt',
            innerContext: createLargeString(size, 'prompt-'),
            startLine: 0,
            endLine: 100,
        }
    }

    const createRule = (size: number) => {
        return {
            name: 'rule',
            description: 'rule',
            relativePath: 'path-rule',
            type: 'rule',
            innerContext: createLargeString(size, 'rule-'),
            startLine: 0,
            endLine: 100,
        }
    }

    const createFile = (size: number) => {
        return {
            name: 'file',
            description: 'file',
            relativePath: 'path-file',
            type: 'file',
            innerContext: createLargeString(size, 'file-'),
            startLine: 0,
            endLine: 100,
        }
    }

    const createBaseTriggerPayload = (): TriggerPayload => ({
        ...mockBasicPayload,
        message: '',
        fileText: '',
        filePath: 'test.ts',
        fileLanguage: 'typescript',
        customization: { arn: '' },
    })
    it('should convert basic trigger payload to chat request', () => {
        const result = triggerPayloadToChatRequest(mockBasicPayload)

        assert.notEqual(result, undefined)
        assert.strictEqual(result.conversationState.currentMessage?.userInputMessage?.content, 'test message')
        assert.strictEqual(result.conversationState.chatTriggerType, 'MANUAL')
        assert.strictEqual(result.conversationState.customizationArn, 'test:arn')
    })

    it('should handle empty file path', () => {
        const emptyFilePathPayload = {
            ...mockBasicPayload,
            filePath: '',
        }

        const result = triggerPayloadToChatRequest(emptyFilePathPayload)

        assert.strictEqual(
            result.conversationState.currentMessage?.userInputMessage?.userInputMessageContext?.editorState?.document,
            undefined
        )
    })

    it('should filter out empty additional contents', () => {
        const payloadWithEmptyContents: TriggerPayload = {
            ...mockBasicPayload,
            additionalContents: [
                {
                    name: 'prompt1',
                    description: 'prompt1',
                    relativePath: 'path1',
                    type: 'prompt',
                    innerContext: '',
                    startLine: 0,
                    endLine: 100,
                },
                {
                    name: 'prompt2',
                    description: 'prompt2',
                    relativePath: 'path2',
                    type: 'prompt',
                    innerContext: 'valid content',
                    startLine: 0,
                    endLine: 100,
                },
            ],
        }

        const result = triggerPayloadToChatRequest(payloadWithEmptyContents)

        assert.strictEqual(
            result.conversationState.currentMessage?.userInputMessage?.userInputMessageContext?.additionalContext
                ?.length,
            1
        )
        assert.strictEqual(
            result.conversationState.currentMessage?.userInputMessage?.userInputMessageContext.additionalContext?.[0]
                .innerContext,
            'valid content'
        )
    })

    it('should handle unsupported programming language', () => {
        const unsupportedLanguagePayload = {
            ...mockBasicPayload,
            fileLanguage: 'unsupported',
        }

        const result = triggerPayloadToChatRequest(unsupportedLanguagePayload)

        assert.strictEqual(
            result.conversationState.currentMessage?.userInputMessage?.userInputMessageContext?.editorState?.document
                ?.programmingLanguage,
            undefined
        )
    })

    it('should truncate file path if it exceeds limit', () => {
        const longFilePath = 'a'.repeat(5000)
        const longFilePathPayload = {
            ...mockBasicPayload,
            filePath: longFilePath,
        }

        const result = triggerPayloadToChatRequest(longFilePathPayload)

        assert.strictEqual(
            result.conversationState.currentMessage?.userInputMessage?.userInputMessageContext?.editorState?.document
                ?.relativeFilePath?.length,
            filePathSizeLimit
        )
    })

    it('should preserve priority order', () => {
        const before1 = [5000, 30000, 40000, 20000, 15000, 25000] // Total: 135,000
        const after1 = [5000, 30000, 40000, 20000, 5000, 0] // Total: 100,000
        checkContextTruncationHelper(before1, after1)

        const before2 = [1000, 2000, 3000, 4000, 5000, 90000] // Total: 105,000
        const after2 = [1000, 2000, 3000, 4000, 5000, 85000] // Total: 100,000
        checkContextTruncationHelper(before2, after2)

        const before3 = [10000, 40000, 80000, 30000, 20000, 50000] // Total: 230,000
        const after3 = [10000, 40000, 50000, 0, 0, 0] // Total: 100,000
        checkContextTruncationHelper(before3, after3)

        const before4 = [5000, 5000, 150000, 5000, 5000, 5000] // Total: 175,000
        const after4 = [5000, 5000, 90000, 0, 0, 0] // Total: 100,000
        checkContextTruncationHelper(before4, after4)

        const before5 = [50000, 80000, 20000, 10000, 10000, 10000] // Total: 180,000
        const after5 = [50000, 50000, 0, 0, 0, 0] // Total: 100,000
        checkContextTruncationHelper(before5, after5)
    })

    function checkContextTruncationHelper(before: number[], after: number[]) {
        const payload = createBaseTriggerPayload()
        const [userInputSize, promptSize, currentFileSize, ruleSize, fileSize, workspaceSize] = before

        payload.message = createLargeString(userInputSize, 'userInput-')
        payload.additionalContents = [createPrompt(promptSize), createRule(ruleSize), createFile(fileSize)]
        payload.fileText = createLargeString(currentFileSize, 'currentFile-')
        payload.relevantTextDocuments = [
            {
                relativeFilePath: 'workspace.ts',
                text: createLargeString(workspaceSize, 'workspace-'),
                startLine: -1,
                endLine: -1,
            },
        ]

        const result = triggerPayloadToChatRequest(payload)

        const userInputLength = result.conversationState.currentMessage?.userInputMessage?.content?.length
        const promptContext =
            result.conversationState.currentMessage?.userInputMessage?.userInputMessageContext?.additionalContext?.find(
                (c) => c.name === 'prompt'
            )?.innerContext
        const currentFileLength =
            result.conversationState.currentMessage?.userInputMessage?.userInputMessageContext?.editorState?.document
                ?.text?.length
        const ruleContext =
            result.conversationState.currentMessage?.userInputMessage?.userInputMessageContext?.additionalContext?.find(
                (c) => c.name === 'rule'
            )?.innerContext
        const fileContext =
            result.conversationState.currentMessage?.userInputMessage?.userInputMessageContext?.additionalContext?.find(
                (c) => c.name === 'file'
            )?.innerContext
        const workspaceContext =
            result.conversationState.currentMessage?.userInputMessage?.userInputMessageContext?.editorState
                ?.relevantDocuments?.[0]?.text

        // Verify priority ordering
        assert.strictEqual(userInputLength ?? 0, after[0])
        assert.strictEqual(promptContext?.length ?? 0, after[1])
        assert.strictEqual(currentFileLength ?? 0, after[2])
        assert.strictEqual(ruleContext?.length ?? 0, after[3])
        assert.strictEqual(fileContext?.length ?? 0, after[4])
        assert.strictEqual(workspaceContext?.length ?? 0, after[5])
    }
})
