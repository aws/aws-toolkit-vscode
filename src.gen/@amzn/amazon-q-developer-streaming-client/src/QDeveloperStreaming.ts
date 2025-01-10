// smithy-typescript generated code
import {
  QDeveloperStreamingClient,
  QDeveloperStreamingClientConfig,
} from "./QDeveloperStreamingClient";
import {
  GenerateCodeFromCommandsCommand,
  GenerateCodeFromCommandsCommandInput,
  GenerateCodeFromCommandsCommandOutput,
} from "./commands/GenerateCodeFromCommandsCommand";
import {
  SendMessageCommand,
  SendMessageCommandInput,
  SendMessageCommandOutput,
} from "./commands/SendMessageCommand";
import { createAggregatedClient } from "@smithy/smithy-client";
import { HttpHandlerOptions as __HttpHandlerOptions } from "@smithy/types";

const commands = {
  GenerateCodeFromCommandsCommand,
  SendMessageCommand,
}

export interface QDeveloperStreaming {
  /**
   * @see {@link GenerateCodeFromCommandsCommand}
   */
  generateCodeFromCommands(
    args: GenerateCodeFromCommandsCommandInput,
    options?: __HttpHandlerOptions,
  ): Promise<GenerateCodeFromCommandsCommandOutput>;
  generateCodeFromCommands(
    args: GenerateCodeFromCommandsCommandInput,
    cb: (err: any, data?: GenerateCodeFromCommandsCommandOutput) => void
  ): void;
  generateCodeFromCommands(
    args: GenerateCodeFromCommandsCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: GenerateCodeFromCommandsCommandOutput) => void
  ): void;

  /**
   * @see {@link SendMessageCommand}
   */
  sendMessage(
    args: SendMessageCommandInput,
    options?: __HttpHandlerOptions,
  ): Promise<SendMessageCommandOutput>;
  sendMessage(
    args: SendMessageCommandInput,
    cb: (err: any, data?: SendMessageCommandOutput) => void
  ): void;
  sendMessage(
    args: SendMessageCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: SendMessageCommandOutput) => void
  ): void;

}

/**
 * @public
 */
export class QDeveloperStreaming extends QDeveloperStreamingClient implements QDeveloperStreaming {}
createAggregatedClient(commands, QDeveloperStreaming);
