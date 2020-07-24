/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
import { Position, TextDocument } from 'vscode-json-languageservice'
export declare function findDocumentType(document: TextDocument): string
export declare function findSchemaVersion(docText: string): string
export declare function parseDocument(textDocument: TextDocument): any
/** @param text string in the form of {{ VARIABLE }} */
export declare function getVariableName(text: string): string
export declare function findRegPattern(
    textDocument: TextDocument,
    pattern: RegExp
): {
    value: string
    start: Position
    end: Position
}[]
