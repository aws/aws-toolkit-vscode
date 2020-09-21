/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
import { CompletionItem, JSONDocument, Position, TextDocument } from 'vscode-json-languageservice'
/** Check whether parameter names should be suggested at current position,
 *  and return the CompletionItem[] for parameter names
 */
export declare function getParameterNameCompletion(
    document: TextDocument,
    position: Position,
    doc?: JSONDocument
): CompletionItem[]
