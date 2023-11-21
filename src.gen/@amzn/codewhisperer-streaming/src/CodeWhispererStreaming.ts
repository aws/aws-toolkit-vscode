// smithy-typescript generated code
import {
  CodeWhispererStreamingClient,
  CodeWhispererStreamingClientConfig,
} from "./CodeWhispererStreamingClient";
import {
  ChatCommand,
  ChatCommandInput,
  ChatCommandOutput,
} from "./commands/ChatCommand";
import {
  ExportResultArchiveCommand,
  ExportResultArchiveCommandInput,
  ExportResultArchiveCommandOutput,
} from "./commands/ExportResultArchiveCommand";
import {
  GenerateAssistantResponseCommand,
  GenerateAssistantResponseCommandInput,
  GenerateAssistantResponseCommandOutput,
} from "./commands/GenerateAssistantResponseCommand";
import {
  GenerateTaskAssistPlanCommand,
  GenerateTaskAssistPlanCommandInput,
  GenerateTaskAssistPlanCommandOutput,
} from "./commands/GenerateTaskAssistPlanCommand";
import { createAggregatedClient } from "@smithy/smithy-client";
import { HttpHandlerOptions as __HttpHandlerOptions } from "@smithy/types";

const commands = {
  ChatCommand,
  ExportResultArchiveCommand,
  GenerateAssistantResponseCommand,
  GenerateTaskAssistPlanCommand,
}

export interface CodeWhispererStreaming {
  /**
   * @see {@link ChatCommand}
   */
  chat(
    args: ChatCommandInput,
    options?: __HttpHandlerOptions,
  ): Promise<ChatCommandOutput>;
  chat(
    args: ChatCommandInput,
    cb: (err: any, data?: ChatCommandOutput) => void
  ): void;
  chat(
    args: ChatCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: ChatCommandOutput) => void
  ): void;

  /**
   * @see {@link ExportResultArchiveCommand}
   */
  exportResultArchive(
    args: ExportResultArchiveCommandInput,
    options?: __HttpHandlerOptions,
  ): Promise<ExportResultArchiveCommandOutput>;
  exportResultArchive(
    args: ExportResultArchiveCommandInput,
    cb: (err: any, data?: ExportResultArchiveCommandOutput) => void
  ): void;
  exportResultArchive(
    args: ExportResultArchiveCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: ExportResultArchiveCommandOutput) => void
  ): void;

  /**
   * @see {@link GenerateAssistantResponseCommand}
   */
  generateAssistantResponse(
    args: GenerateAssistantResponseCommandInput,
    options?: __HttpHandlerOptions,
  ): Promise<GenerateAssistantResponseCommandOutput>;
  generateAssistantResponse(
    args: GenerateAssistantResponseCommandInput,
    cb: (err: any, data?: GenerateAssistantResponseCommandOutput) => void
  ): void;
  generateAssistantResponse(
    args: GenerateAssistantResponseCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: GenerateAssistantResponseCommandOutput) => void
  ): void;

  /**
   * @see {@link GenerateTaskAssistPlanCommand}
   */
  generateTaskAssistPlan(
    args: GenerateTaskAssistPlanCommandInput,
    options?: __HttpHandlerOptions,
  ): Promise<GenerateTaskAssistPlanCommandOutput>;
  generateTaskAssistPlan(
    args: GenerateTaskAssistPlanCommandInput,
    cb: (err: any, data?: GenerateTaskAssistPlanCommandOutput) => void
  ): void;
  generateTaskAssistPlan(
    args: GenerateTaskAssistPlanCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: GenerateTaskAssistPlanCommandOutput) => void
  ): void;

}

/**
 * @public
 */
export class CodeWhispererStreaming extends CodeWhispererStreamingClient implements CodeWhispererStreaming {}
createAggregatedClient(commands, CodeWhispererStreaming);
