import assert from 'assert'
import { ChatTriggerType, TriggerPayload, triggerPayloadToChatRequest } from 'aws-core-vscode/codewhispererChat'
import { filePathSizeLimit } from '../../../../../../../core/dist/src/codewhispererChat/controllers/chat/chatRequest/converter'

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
        }
    }

    const createRule = (size: number) => {
        return {
            name: 'rule',
            description: 'rule',
            relativePath: 'path-rule',
            type: 'rule',
            innerContext: createLargeString(size, 'rule-'),
        }
    }

    const createFile = (size: number) => {
        return {
            name: 'file',
            description: 'file',
            relativePath: 'path-file',
            type: 'file',
            innerContext: createLargeString(size, 'file-'),
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
                { name: 'prompt1', description: 'prompt1', relativePath: 'path1', type: 'prompt', innerContext: '' },
                {
                    name: 'prompt2',
                    description: 'prompt2',
                    relativePath: 'path2',
                    type: 'prompt',
                    innerContext: 'valid content',
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

    it('should preserve Type A (user input) over all other types when size exceeds limit', () => {
        const payload = createBaseTriggerPayload()
        const userInputSize = 60_000
        const promptSize = 30_000
        const currentFileSize = 20_000

        payload.message = createLargeString(userInputSize, 'userInput-')
        payload.additionalContents = [createPrompt(promptSize)]
        payload.fileText = createLargeString(currentFileSize, 'currentFile-')

        const result = triggerPayloadToChatRequest(payload)

        // User input should be preserved completely
        assert.strictEqual(result.conversationState.currentMessage?.userInputMessage?.content?.length, userInputSize)

        // Other contexts should be truncated
        assert.ok(
            result.conversationState.currentMessage?.userInputMessage?.userInputMessageContext?.additionalContext?.[0]
                .innerContext?.length! < promptSize
        )
        assert.ok(
            result.conversationState.currentMessage?.userInputMessage?.userInputMessageContext?.editorState?.document
                ?.text?.length! < currentFileSize
        )
    })

    it('should preserve Type B1(prompts) over lower priority contexts when size exceeds limit', () => {
        const payload = createBaseTriggerPayload()
        const promptSize = 50_000
        const currentFileSize = 40_000
        const ruleSize = 30_000

        payload.additionalContents = [createPrompt(promptSize), createRule(ruleSize)]
        payload.fileText = createLargeString(currentFileSize, 'currentFile-')

        const result = triggerPayloadToChatRequest(payload)

        // Prompt context should be preserved more than others
        const promptContext =
            result.conversationState.currentMessage?.userInputMessage?.userInputMessageContext?.additionalContext?.find(
                (c) => c?.name === 'prompt'
            )?.innerContext
        const ruleContext =
            result.conversationState.currentMessage?.userInputMessage?.userInputMessageContext?.additionalContext?.find(
                (c) => c?.name === 'rule'
            )?.innerContext

        assert.ok(promptContext!.length > ruleContext!.length)
        assert.ok(
            result.conversationState.currentMessage?.userInputMessage?.userInputMessageContext?.editorState?.document
                ?.text?.length! < currentFileSize
        )
    })

    it('should preserve Type C (current file) over B1(rules), B2(files), and B3(workspace)', () => {
        const payload = createBaseTriggerPayload()
        const currentFileSize = 40_000
        const ruleSize = 30_000
        const fileSize = 20_000
        const workspaceSize = 10_000

        payload.fileText = createLargeString(currentFileSize, 'currentFile-')
        payload.additionalContents = [createRule(ruleSize), createFile(fileSize)]
        payload.relevantTextDocuments = [
            {
                relativeFilePath: 'workspace.ts',
                text: createLargeString(workspaceSize, 'workspace-'),
                startLine: -1,
                endLine: -1,
            },
        ]

        const result = triggerPayloadToChatRequest(payload)

        const currentFileLength =
            result.conversationState.currentMessage?.userInputMessage?.userInputMessageContext?.editorState?.document
                ?.text?.length!
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
                ?.relevantDocuments?.[0].text

        assert.ok(currentFileLength > ruleContext!.length)
        assert.ok(ruleContext!.length > fileContext!.length)
        assert.ok(fileContext!.length > workspaceContext!.length)
    })

    it('should preserve priority order when all context types are present', () => {
        const payload = createBaseTriggerPayload()
        const userInputSize = 30_000
        const promptSize = 25_000
        const currentFileSize = 20_000
        const ruleSize = 15_000
        const fileSize = 10_000
        const workspaceSize = 5_000

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

        const userInputLength = result.conversationState.currentMessage?.userInputMessage?.content?.length!
        const promptContext =
            result.conversationState.currentMessage?.userInputMessage?.userInputMessageContext?.additionalContext?.find(
                (c) => c.name === 'prompt'
            )?.innerContext
        const currentFileLength =
            result.conversationState.currentMessage?.userInputMessage?.userInputMessageContext?.editorState?.document
                ?.text?.length!
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
                ?.relevantDocuments?.[0].text

        // Verify priority ordering
        assert.ok(userInputLength >= promptContext!.length)
        assert.ok(promptContext!.length >= currentFileLength)
        assert.ok(currentFileLength >= ruleContext!.length)
        assert.ok(ruleContext!.length >= fileContext!.length)
        assert.ok(fileContext!.length >= workspaceContext!.length)
    })
})
