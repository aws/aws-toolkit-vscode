/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
import * as JsonLS from 'vscode-json-languageservice'
import { getLanguageService as getLanguageServiceYAML } from 'yaml-language-server'
import { plugins, supportedDocumentTypes } from './constants/constants'
declare type JSONGetLSFunc = typeof JsonLS.getLanguageService
declare type YamlGetLSFunc = typeof getLanguageServiceYAML
export { JsonLS }
declare const automationActions: string[]
export { plugins, automationActions, supportedDocumentTypes }
import * as ast from './util/astFunctions'
export { ast }
export declare function getDocumentTemplate(documenType: string): object
export interface SSMLanguageSettings extends JsonLS.LanguageSettings {
    hover?: boolean
    completion?: boolean
}
export interface SSMLanguageService {
    configure(settings: SSMLanguageSettings): void
    doValidation(
        document: JsonLS.TextDocument,
        jsonDocument?: JsonLS.JSONDocument,
        documentSettings?: JsonLS.DocumentLanguageSettings,
        schema?: JsonLS.JSONSchema
    ): JsonLS.Thenable<JsonLS.Diagnostic[]>
    doComplete(
        document: JsonLS.TextDocument,
        position: JsonLS.Position,
        jsonDocument?: JsonLS.JSONDocument
    ): JsonLS.Thenable<JsonLS.CompletionList | null>
    doResolve(item: JsonLS.CompletionItem): JsonLS.Thenable<JsonLS.CompletionItem>
    doHover(
        document: JsonLS.TextDocument,
        position: JsonLS.Position,
        jsonDocument?: JsonLS.JSONDocument
    ): JsonLS.Thenable<JsonLS.Hover | null>
    findDocumentSymbols(
        document: JsonLS.TextDocument,
        jsonDocument?: JsonLS.JSONDocument,
        context?: JsonLS.DocumentSymbolsContext
    ): JsonLS.SymbolInformation[]
    findDocumentSymbols2(
        document: JsonLS.TextDocument,
        jsonDocument?: JsonLS.JSONDocument,
        context?: JsonLS.DocumentSymbolsContext
    ): JsonLS.DocumentSymbol[]
    format(document: JsonLS.TextDocument, range: JsonLS.Range, options: JsonLS.FormattingOptions): JsonLS.TextEdit[]
    findDocumentColors(
        document: JsonLS.TextDocument,
        doc: JsonLS.JSONDocument,
        context?: JsonLS.ColorInformationContext
    ): JsonLS.Thenable<JsonLS.ColorInformation[]>
    getColorPresentations(
        document: JsonLS.TextDocument,
        doc: JsonLS.JSONDocument,
        color: JsonLS.Color,
        range: JsonLS.Range
    ): JsonLS.ColorPresentation[]
    getFoldingRanges(document: JsonLS.TextDocument, context?: JsonLS.FoldingRangesContext): JsonLS.FoldingRange[]
    getSelectionRanges(
        document: JsonLS.TextDocument,
        positions: JsonLS.Position[],
        doc: JsonLS.JSONDocument
    ): JsonLS.SelectionRange[]
    resetSchema(uri: string): boolean
    parseJSONDocument(document: JsonLS.TextDocument): JsonLS.JSONDocument
}
export declare function getLanguageServiceSSM(params: JsonLS.LanguageServiceParams): SSMLanguageService
export declare const getLanguageServiceSSMYAML: YamlGetLSFunc
export declare const getLanguageServiceSSMJSON: JSONGetLSFunc
