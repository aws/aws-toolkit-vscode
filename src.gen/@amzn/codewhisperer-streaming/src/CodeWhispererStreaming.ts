// smithy-typescript generated code
import {
  CodeWhispererStreamingClient,
  CodeWhispererStreamingClientConfig,
} from "./CodeWhispererStreamingClient";
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
import {
  SendMessageCommand,
  SendMessageCommandInput,
  SendMessageCommandOutput,
} from "./commands/SendMessageCommand";
import { createAggregatedClient } from "@smithy/smithy-client";
import { HttpHandlerOptions as __HttpHandlerOptions } from "@smithy/types";

const commands = {
  ExportResultArchiveCommand,
  GenerateAssistantResponseCommand,
  GenerateTaskAssistPlanCommand,
  SendMessageCommand,
}

export interface CodeWhispererStreaming {
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
export class CodeWhispererStreaming extends CodeWhispererStreamingClient implements CodeWhispererStreaming {}
createAggregatedClient(commands, CodeWhispererStreaming);
