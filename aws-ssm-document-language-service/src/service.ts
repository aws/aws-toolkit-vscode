/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */

import * as JsonLS from 'vscode-json-languageservice'
import * as YAML from 'yaml'
import { getLanguageService as getLanguageServiceYAML } from 'yaml-language-server'
import { parse } from 'yaml-language-server/out/server/src/languageservice/parser/yamlParser07'

import { join } from 'path'

import { complete, getYAMLActionSnippetsCompletion } from './completion/complete'
import { automationAction, plugins, supportedDocumentTypes } from './constants/constants'
import ssmSchema from './json-schema/ssmdocschema.json'
import { validate } from './validation/validate'

import parameterObject from './json-schema/partial/parameterObject.json'
import automationSnippets from './json-schema/partial/snippets/automationSnippets.json'
import commandSnippets from './json-schema/partial/snippets/commandSnippets.json'

import automationTemplate from './templates/automation.json'
import commandTemplate from './templates/command.json'

type JSONGetLSFunc = typeof JsonLS.getLanguageService
type YamlGetLSFunc = typeof getLanguageServiceYAML

export { JsonLS }

const automationActions = Object.keys(automationAction)
export { plugins, automationActions, supportedDocumentTypes }

import * as ast from './util/astFunctions'
export { ast }

export function getDocumentTemplate(documenType: string): object {
    if (documenType === 'command') {
        return commandTemplate
    } else if (documenType === 'automation') {
        return automationTemplate
    }

    return {}
}

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

export function getLanguageServiceSSM(params: JsonLS.LanguageServiceParams): SSMLanguageService {
    let languageService: SSMLanguageService
    const languageServiceJSON = getLanguageServiceSSMJSON(params)
    const languageServiceYAML = getLanguageServiceSSMYAML(
        params.schemaRequestService,
        params.workspaceContext,
        params.contributions,
        params.promiseConstructor
    )

    languageService = {
        configure: function(settings: SSMLanguageSettings) {
            languageServiceJSON.configure({
                validate: settings.validate,
                allowComments: settings.allowComments,
                schemas: settings.schemas,
            })
            languageServiceYAML.configure({
                validate: settings.validate,
                hover: settings.hover,
                completion: settings.completion,
                schemas: settings.schemas,
            })
        },
        doValidation: async (
            document: JsonLS.TextDocument,
            jsonDocument?: JsonLS.JSONDocument,
            documentSettings?: JsonLS.DocumentLanguageSettings,
            schema?: JsonLS.JSONSchema
        ) => {
            if (document.languageId === 'ssm-json') {
                return await languageServiceJSON.doValidation(document, jsonDocument, documentSettings, schema)
            }

            return await languageServiceYAML.doValidation(document, false)
        },
        doComplete: async (
            document: JsonLS.TextDocument,
            position: JsonLS.Position,
            jsonDocument?: JsonLS.JSONDocument
        ) => {
            if (document.languageId === 'ssm-json') {
                return await languageServiceJSON.doComplete(document, position, jsonDocument)
            }

            return await languageServiceYAML.doComplete(document, position, false)
        },
        doResolve: async (item: JsonLS.CompletionItem) => {
            const jsonResult = await languageServiceJSON.doResolve(item)
            if (!jsonResult.label && jsonResult !== item) {
                return jsonResult
            }

            const yamlResult = await languageServiceYAML.doResolve(item)

            return yamlResult
        },
        doHover: async (
            document: JsonLS.TextDocument,
            position: JsonLS.Position,
            jsonDocument?: JsonLS.JSONDocument
        ) => {
            if (document.languageId === 'ssm-json') {
                return await languageServiceJSON.doHover(document, position, jsonDocument)
            }

            return await languageServiceYAML.doHover(document, position)
        },
        findDocumentSymbols: (
            document: JsonLS.TextDocument,
            jsonDocument?: JsonLS.JSONDocument,
            context?: JsonLS.DocumentSymbolsContext
        ) => {
            if (document.languageId === 'ssm-json') {
                return languageServiceJSON.findDocumentSymbols(document, jsonDocument, context)
            }

            return languageServiceYAML.findDocumentSymbols(document)
        },
        findDocumentSymbols2: (
            document: JsonLS.TextDocument,
            jsonDocument?: JsonLS.JSONDocument,
            context?: JsonLS.DocumentSymbolsContext
        ) => {
            if (document.languageId === 'ssm-json') {
                return languageServiceJSON.findDocumentSymbols2(document, jsonDocument, context)
            }

            return languageServiceYAML.findDocumentSymbols2(document)
        },
        format: (document: JsonLS.TextDocument, range: JsonLS.Range, options: JsonLS.FormattingOptions) => {
            if (document.languageId === 'ssm-json') {
                return languageServiceJSON.format(document, range, options)
            }

            return languageServiceYAML.doFormat(document, {})
        },
        findDocumentColors: async (
            document: JsonLS.TextDocument,
            doc: JsonLS.JSONDocument,
            context?: JsonLS.ColorInformationContext
        ) => {
            return await languageServiceJSON.findDocumentColors(document, doc, context)
        },
        getColorPresentations: (
            document: JsonLS.TextDocument,
            doc: JsonLS.JSONDocument,
            color: JsonLS.Color,
            range: JsonLS.Range
        ) => {
            return languageServiceJSON.getColorPresentations(document, doc, color, range)
        },
        getFoldingRanges: (document: JsonLS.TextDocument, context?: JsonLS.FoldingRangesContext) => {
            return languageServiceJSON.getFoldingRanges(document, context)
        },
        getSelectionRanges: (document: JsonLS.TextDocument, positions: JsonLS.Position[], doc: JsonLS.JSONDocument) => {
            return languageServiceJSON.getSelectionRanges(document, positions, doc)
        },
        resetSchema: (uri: string) => {
            const jsonResult = languageServiceJSON.resetSchema(uri)
            const yamlResult = languageServiceYAML.resetSchema(uri)

            return jsonResult || yamlResult
        },
        parseJSONDocument: (document: JsonLS.TextDocument): JsonLS.JSONDocument => {
            if (document.languageId === 'ssm-json') {
                // tslint:disable-next-line: no-inferred-empty-object-type
                return languageServiceJSON.parseJSONDocument(document)
            }

            return parse(document.getText()).documents[0] as JsonLS.JSONDocument
        },
    }

    return languageService
}

function getYAMLSnippets(): Map<string, string> {
    const allSnippets: Map<string, string> = new Map<string, string>()
    parameterObject.definitions.additionalProperties.defaultSnippets.forEach(item => {
        allSnippets.set(item.label, YAML.stringify(item.body))
    })
    automationSnippets.definitions['0.3'].defaultSnippets.forEach(item => {
        allSnippets.set(item.label, YAML.stringify(item.body))
    })
    commandSnippets.definitions['2.2'].defaultSnippets.forEach(item => {
        allSnippets.set(item.label, YAML.stringify(item.body))
    })

    return allSnippets
}

export const getLanguageServiceSSMYAML: YamlGetLSFunc = (
    schemaRequestService,
    workspaceContext,
    contributions,
    promiseConstructor
) => {
    const languageService = getLanguageServiceYAML(
        schemaRequestService,
        workspaceContext,
        contributions,
        promiseConstructor
    )

    languageService.configure({
        validate: true,
        hover: true,
        completion: true,
        schemas: [
            {
                fileMatch: ['*'],
                schema: ssmSchema,
                uri: 'file://' + join(__dirname, 'json-schema', 'ssmdocschema.json'),
            },
        ],
    })

    const allSnippets = getYAMLSnippets()

    const doValidation = languageService.doValidation.bind(languageService) as typeof languageService.doValidation
    const doComplete = languageService.doComplete.bind(languageService) as typeof languageService.doComplete

    languageService.doValidation = async document => {
        // vscode-json-languageservice will always set severity as warning for JSONSchema validation
        // there is no option to configure this behavior so severity needs to be overwritten as error
        let diagnostics = (await doValidation(document, false)).map(diagnostic => {
            diagnostic.severity = JsonLS.DiagnosticSeverity.Error

            return diagnostic
        }) as JsonLS.Diagnostic[]

        diagnostics = diagnostics.concat(validate(document))
        diagnostics.forEach(diagnostic => {
            diagnostic.source = 'AWS Toolkit (Extension).'
        })

        return diagnostics
    }

    languageService.doComplete = async (document, position, doc) => {
        const completionList = await doComplete(document, position, false)
        completionList.items = getYAMLActionSnippetsCompletion(allSnippets, completionList.items)
        completionList.items = completionList.items.concat(complete(document, position, doc))

        completionList.items.sort((a, b) => {
            return a.kind - b.kind
        })

        return completionList
    }

    return languageService
}

export const getLanguageServiceSSMJSON: JSONGetLSFunc = params => {
    const buildInParams = {}
    const languageService = JsonLS.getLanguageService({ ...params, ...buildInParams })
    const doValidation = languageService.doValidation.bind(languageService) as typeof languageService.doValidation
    const doComplete = languageService.doComplete.bind(languageService) as typeof languageService.doComplete

    languageService.configure({
        validate: true,
        allowComments: false,
        schemas: [
            {
                uri: 'ssm',
                fileMatch: ['*'],
                schema: ssmSchema,
            },
        ],
    })

    languageService.doValidation = async (document, jsonDocument, documentSettings) => {
        // vscode-json-languageservice will always set severity as warning for JSONSchema validation
        // there is no option to configure this behavior so severity needs to be overwritten as error
        let diagnostics = (await doValidation(document, jsonDocument, documentSettings)).map(diagnostic => {
            diagnostic.severity = JsonLS.DiagnosticSeverity.Error

            return diagnostic
        }) as JsonLS.Diagnostic[]

        diagnostics = diagnostics.concat(validate(document))
        diagnostics.forEach(diagnostic => {
            diagnostic.source = 'AWS Toolkit (Extension).'
        })

        return diagnostics
    }

    languageService.doComplete = async (document, position, doc) => {
        const completionList = await doComplete(document, position, doc)
        completionList.items = completionList.items.concat(complete(document, position, doc))

        completionList.items.sort((a, b) => {
            return a.kind - b.kind
        })

        return completionList
    }

    return languageService
}
