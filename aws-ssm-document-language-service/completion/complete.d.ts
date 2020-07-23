/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
import { CompletionItem, JSONDocument, Position, TextDocument } from 'vscode-json-languageservice'
import { getYAMLActionSnippetsCompletion } from './completeSnippet'
/** Returns CompletionItem[] for additional auto-completion, which includes:
 *      1. action snippets for inserting a new action
 *      2. parameter snippets for inserting a new parameter
 *      3. parameter names for editing the name of a parameter variable {{ VAR_NAME }}
 */
export declare function complete(document: TextDocument, position: Position, doc?: JSONDocument): CompletionItem[]
export { getYAMLActionSnippetsCompletion }
