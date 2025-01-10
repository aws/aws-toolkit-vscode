// smithy-typescript generated code
import { QDeveloperStreamingClient } from "./QDeveloperStreamingClient";
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
import { HttpHandlerOptions as __HttpHandlerOptions } from "@aws-sdk/types";

export class QDeveloperStreaming extends QDeveloperStreamingClient {
  /**
   * API to generate infrastructure as code from cli commands.
   */
  public generateCodeFromCommands(
    args: GenerateCodeFromCommandsCommandInput,
    options?: __HttpHandlerOptions,
  ): Promise<GenerateCodeFromCommandsCommandOutput>;
  public generateCodeFromCommands(
    args: GenerateCodeFromCommandsCommandInput,
    cb: (err: any, data?: GenerateCodeFromCommandsCommandOutput) => void
  ): void;
  public generateCodeFromCommands(
    args: GenerateCodeFromCommandsCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: GenerateCodeFromCommandsCommandOutput) => void
  ): void;
  public generateCodeFromCommands(
    args: GenerateCodeFromCommandsCommandInput,
    optionsOrCb?: __HttpHandlerOptions | ((err: any, data?: GenerateCodeFromCommandsCommandOutput) => void),
    cb?: (err: any, data?: GenerateCodeFromCommandsCommandOutput) => void
  ): Promise<GenerateCodeFromCommandsCommandOutput> | void {
    const command = new GenerateCodeFromCommandsCommand(args);
    if (typeof optionsOrCb === "function") {
      this.send(command, optionsOrCb)
    } else if (typeof cb === "function") {
      if (typeof optionsOrCb !== "object")
        throw new Error(`Expect http options but get ${typeof optionsOrCb}`)
      this.send(command, optionsOrCb || {}, cb)
    } else {
      return this.send(command, optionsOrCb);
    }
  }

  public sendMessage(
    args: SendMessageCommandInput,
    options?: __HttpHandlerOptions,
  ): Promise<SendMessageCommandOutput>;
  public sendMessage(
    args: SendMessageCommandInput,
    cb: (err: any, data?: SendMessageCommandOutput) => void
  ): void;
  public sendMessage(
    args: SendMessageCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: SendMessageCommandOutput) => void
  ): void;
  public sendMessage(
    args: SendMessageCommandInput,
    optionsOrCb?: __HttpHandlerOptions | ((err: any, data?: SendMessageCommandOutput) => void),
    cb?: (err: any, data?: SendMessageCommandOutput) => void
  ): Promise<SendMessageCommandOutput> | void {
    const command = new SendMessageCommand(args);
    if (typeof optionsOrCb === "function") {
      this.send(command, optionsOrCb)
    } else if (typeof cb === "function") {
      if (typeof optionsOrCb !== "object")
        throw new Error(`Expect http options but get ${typeof optionsOrCb}`)
      this.send(command, optionsOrCb || {}, cb)
    } else {
      return this.send(command, optionsOrCb);
    }
  }

}
