// smithy-typescript generated code
import { CodeWhispererStreamingClient, CodeWhispererStreamingClientConfig } from './CodeWhispererStreamingClient'
import { ChatCommand, ChatCommandInput, ChatCommandOutput } from './commands/ChatCommand'
import {
    ExecutePlanningInteractionCommand,
    ExecutePlanningInteractionCommandInput,
    ExecutePlanningInteractionCommandOutput,
} from './commands/ExecutePlanningInteractionCommand'
import {
    GetCodeGenerationInteractionResultCommand,
    GetCodeGenerationInteractionResultCommandInput,
    GetCodeGenerationInteractionResultCommandOutput,
} from './commands/GetCodeGenerationInteractionResultCommand'
import {
    StartConversationCommand,
    StartConversationCommandInput,
    StartConversationCommandOutput,
} from './commands/StartConversationCommand'
import { createAggregatedClient } from '@smithy/smithy-client'
import { HttpHandlerOptions as __HttpHandlerOptions } from '@smithy/types'

const commands = {
    ChatCommand,
    ExecutePlanningInteractionCommand,
    GetCodeGenerationInteractionResultCommand,
    StartConversationCommand,
}

export interface CodeWhispererStreaming {
    /**
     * @see {@link ChatCommand}
     */
    chat(args: ChatCommandInput, options?: __HttpHandlerOptions): Promise<ChatCommandOutput>
    chat(args: ChatCommandInput, cb: (err: any, data?: ChatCommandOutput) => void): void
    chat(args: ChatCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ChatCommandOutput) => void): void

    /**
     * @see {@link ExecutePlanningInteractionCommand}
     */
    executePlanningInteraction(
        args: ExecutePlanningInteractionCommandInput,
        options?: __HttpHandlerOptions
    ): Promise<ExecutePlanningInteractionCommandOutput>
    executePlanningInteraction(
        args: ExecutePlanningInteractionCommandInput,
        cb: (err: any, data?: ExecutePlanningInteractionCommandOutput) => void
    ): void
    executePlanningInteraction(
        args: ExecutePlanningInteractionCommandInput,
        options: __HttpHandlerOptions,
        cb: (err: any, data?: ExecutePlanningInteractionCommandOutput) => void
    ): void

    /**
     * @see {@link GetCodeGenerationInteractionResultCommand}
     */
    getCodeGenerationInteractionResult(
        args: GetCodeGenerationInteractionResultCommandInput,
        options?: __HttpHandlerOptions
    ): Promise<GetCodeGenerationInteractionResultCommandOutput>
    getCodeGenerationInteractionResult(
        args: GetCodeGenerationInteractionResultCommandInput,
        cb: (err: any, data?: GetCodeGenerationInteractionResultCommandOutput) => void
    ): void
    getCodeGenerationInteractionResult(
        args: GetCodeGenerationInteractionResultCommandInput,
        options: __HttpHandlerOptions,
        cb: (err: any, data?: GetCodeGenerationInteractionResultCommandOutput) => void
    ): void

    /**
     * @see {@link StartConversationCommand}
     */
    startConversation(
        args: StartConversationCommandInput,
        options?: __HttpHandlerOptions
    ): Promise<StartConversationCommandOutput>
    startConversation(
        args: StartConversationCommandInput,
        cb: (err: any, data?: StartConversationCommandOutput) => void
    ): void
    startConversation(
        args: StartConversationCommandInput,
        options: __HttpHandlerOptions,
        cb: (err: any, data?: StartConversationCommandOutput) => void
    ): void
}

/**
 * @public
 */
export class CodeWhispererStreaming extends CodeWhispererStreamingClient implements CodeWhispererStreaming {}
createAggregatedClient(commands, CodeWhispererStreaming)
