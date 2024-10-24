import { GenerateCodeFromCommandsCommandInput, GenerateCodeFromCommandsCommandOutput } from "../commands/GenerateCodeFromCommandsCommand";
import { SendMessageCommandInput, SendMessageCommandOutput } from "../commands/SendMessageCommand";
import { HttpRequest as __HttpRequest, HttpResponse as __HttpResponse } from "@smithy/protocol-http";
import { EventStreamSerdeContext as __EventStreamSerdeContext, SerdeContext as __SerdeContext } from "@smithy/types";
/**
 * serializeAws_json1_0GenerateCodeFromCommandsCommand
 */
export declare const se_GenerateCodeFromCommandsCommand: (input: GenerateCodeFromCommandsCommandInput, context: __SerdeContext) => Promise<__HttpRequest>;
/**
 * serializeAws_json1_0SendMessageCommand
 */
export declare const se_SendMessageCommand: (input: SendMessageCommandInput, context: __SerdeContext) => Promise<__HttpRequest>;
/**
 * deserializeAws_json1_0GenerateCodeFromCommandsCommand
 */
export declare const de_GenerateCodeFromCommandsCommand: (output: __HttpResponse, context: __SerdeContext & __EventStreamSerdeContext) => Promise<GenerateCodeFromCommandsCommandOutput>;
/**
 * deserializeAws_json1_0SendMessageCommand
 */
export declare const de_SendMessageCommand: (output: __HttpResponse, context: __SerdeContext & __EventStreamSerdeContext) => Promise<SendMessageCommandOutput>;
