/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
import { Diagnostic, TextDocument } from 'vscode-json-languageservice'
export declare function validateVariableValues(textDocument: TextDocument): Diagnostic[]
export declare function validateVariableParameters(textDocument: TextDocument): Diagnostic[]
