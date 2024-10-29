import { QDeveloperStreamingClient } from "./QDeveloperStreamingClient";
import { GenerateCodeFromCommandsCommandInput, GenerateCodeFromCommandsCommandOutput } from "./commands/GenerateCodeFromCommandsCommand";
import { SendMessageCommandInput, SendMessageCommandOutput } from "./commands/SendMessageCommand";
import { HttpHandlerOptions as __HttpHandlerOptions } from "@smithy/types";
export interface QDeveloperStreaming {
    /**
     * @see {@link GenerateCodeFromCommandsCommand}
     */
    generateCodeFromCommands(args: GenerateCodeFromCommandsCommandInput, options?: __HttpHandlerOptions): Promise<GenerateCodeFromCommandsCommandOutput>;
    generateCodeFromCommands(args: GenerateCodeFromCommandsCommandInput, cb: (err: any, data?: GenerateCodeFromCommandsCommandOutput) => void): void;
    generateCodeFromCommands(args: GenerateCodeFromCommandsCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GenerateCodeFromCommandsCommandOutput) => void): void;
    /**
     * @see {@link SendMessageCommand}
     */
    sendMessage(args: SendMessageCommandInput, options?: __HttpHandlerOptions): Promise<SendMessageCommandOutput>;
    sendMessage(args: SendMessageCommandInput, cb: (err: any, data?: SendMessageCommandOutput) => void): void;
    sendMessage(args: SendMessageCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: SendMessageCommandOutput) => void): void;
}
/**
 * @public
 */
export declare class QDeveloperStreaming extends QDeveloperStreamingClient implements QDeveloperStreaming {
}
