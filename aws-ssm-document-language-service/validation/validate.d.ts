/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
import { Diagnostic, TextDocument } from 'vscode-json-languageservice'
import { validateSchemaVersion } from './validateSchemaVersion'
import { validateStepsNonCyclic } from './validateStepsNonCyclic'
import { validateVariableParameters, validateVariableValues } from './validateVariables'
export { validateSchemaVersion, validateStepsNonCyclic, validateVariableParameters, validateVariableValues }
/** Returns Diagnostic[] for additional validations, which includes:
 *      1. validate whether schemaVersion is valid for documentType
 *      2. validate all variable parameters of format {{ VAR_NAME }}
 *      3. validate all variable parameters {{ ACTION.VAR }}
 *      4. validate that automation actions do not form a cycle
 */
export declare function validate(document: TextDocument): Diagnostic[]
