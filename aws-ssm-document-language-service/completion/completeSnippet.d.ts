/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
import { CompletionItem, JSONDocument, Position, TextDocument } from 'vscode-json-languageservice'
/** Check whether parameter snippets should be suggested at current position,
 *  and return the CompletionItem[] for parameter snippets
 */
export declare function getJSONParameterSnippetsCompletion(
    document: TextDocument,
    position: Position,
    doc?: JSONDocument
): CompletionItem[]
/** YAML language server cannot parse snippets' insertText correctly from JSON object defined in
 *  the defaultSnippets property of JSON Schema, so this function changes completion items provided
 *  by the YAML language server to the correct form
 *  Problems:
 *      1. {{ VARIABLE }} will cause syntax errors in YAML
 *      2. snippets with string arrays will be parsed into a list characters
 *  Fixes:
 *      replace the insertText with YAML.stringify(snippet.body)
 */
export declare function getYAMLActionSnippetsCompletion(
    snippets: Map<string, string>,
    items: CompletionItem[]
): CompletionItem[]
