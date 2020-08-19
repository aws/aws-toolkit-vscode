/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/unbound-method*/

import {
    ASL_SCHEMA,
    doCompleteAsl,
    ClientCapabilities,
    getLanguageService as getASLLanguageService,
    LanguageService,
} from 'amazon-states-language-service'
import {
    DocumentLanguageSettings,
    JSONDocument,
    getLanguageService as getLanguageServiceVscode,
    LanguageServiceParams,
} from 'vscode-json-languageservice'
import {
    parse as parseYAML,
    YAMLDocument,
    SingleYAMLDocument,
} from 'yaml-language-server/out/server/src/languageservice/parser/yamlParser07'
import {
    CompletionItem,
    CompletionList,
    DocumentSymbol,
    FormattingOptions,
    Hover,
    TextEdit,
    TextDocument,
    Position,
    Range,
    SymbolInformation,
} from 'vscode-languageserver-types'
import { matchOffsetToDocument } from 'yaml-language-server/out/server/src/languageservice/utils/arrUtils'
import { YAMLSchemaService } from 'yaml-language-server/out/server/src/languageservice/services/yamlSchemaService'
import { YAMLCompletion } from 'yaml-language-server/out/server/src/languageservice/services/yamlCompletion'
import * as URL from 'url'
import * as prettier from 'prettier'

const workspaceContext = {
    resolveRelativePath: (relativePath: string, resource: string) => {
        return URL.resolve(resource, relativePath)
    },
}

const aslLanguageService = getASLLanguageService({
    workspaceContext,
    contributions: [],
    clientCapabilities: ClientCapabilities.LATEST,
    aslOptions: {
        ignoreColonOffset: true,
    },
})

const requestServiceMock = function(uri: string): Promise<string> {
    return new Promise<string>(c => {
        c(JSON.stringify(ASL_SCHEMA))
    })
}

const schemaService = new YAMLSchemaService(requestServiceMock, workspaceContext)

// initialize schema
schemaService.registerExternalSchema('yasl', ['*.asl.yaml', '*.asl.yml'], ASL_SCHEMA)
schemaService.getSchemaForResource('test.asl.yaml', undefined)

const completer = new YAMLCompletion(schemaService)

export const getLanguageService = function(params: LanguageServiceParams): LanguageService {
    const builtInParams = {}

    let languageService = getLanguageServiceVscode({
        ...params,
        ...builtInParams,
    })

    languageService.doValidation = async function(
        textDocument: TextDocument,
        jsonDocument: JSONDocument,
        documentSettings: DocumentLanguageSettings
    ) {
        const yamlDocument: YAMLDocument = parseYAML(textDocument.getText())
        const validationResult: any[] = []

        for (const currentYAMLDoc of yamlDocument.documents) {
            const validation = await aslLanguageService.doValidation(textDocument, currentYAMLDoc)
            const syd = ((currentYAMLDoc as unknown) as any) as SingleYAMLDocument
            if (syd.errors.length > 0) {
                validationResult.push(...syd.errors)
            }
            if (syd.warnings.length > 0) {
                validationResult.push(...syd.warnings)
            }

            validationResult.push(...validation)
        }
        return validationResult
    }

    languageService.doComplete = async function(
        document: TextDocument,
        position: Position,
        doc: JSONDocument
    ): Promise<CompletionList> {
        let yamldoc = parseYAML(document.getText())
        const offset = document.offsetAt(position)
        let currentDoc = matchOffsetToDocument(offset, yamldoc)
        let atSpace = false

        // if a yaml doc is null, it must be given text to allow auto-completion
        if (!currentDoc) {
            currentDoc = initializeDocument(document, offset)
            // move cursor position into new empty object
            position.character += 1
        }

        const yamlCompletions = await completer.doComplete(document, position, false)

        // adjust position for completion
        const node = currentDoc.getNodeFromOffsetEndInclusive(offset)
        if (node.type === 'array') {
            // Resolves issue with array item insert text being off by a space
            position.character -= 1
        } else if (document.getText().substring(offset, offset + 1) === '"') {
            // When attempting to auto-complete from inside an empty string, the position must be adjusted within bounds
            position.character += 1
        } else if (document.getText().substring(offset - 2, offset) === ': ') {
            // yaml doesn't allow auto-completion from white-space after certain nodes
            atSpace = true
            // initialize an empty string and adjust position to within the string before parsing yaml to json
            const newText = document.getText().substring(0, offset) + '""\n' + document.getText().substr(offset)
            const yamldoc = parseYAML(newText)
            currentDoc = matchOffsetToDocument(offset, yamldoc)
            position.character += 1
        } else if (node.type === 'property' || (node.type === 'object' && position.character !== 0)) {
            // allow auto-completion of States field from empty space
            if (document.getText().substring(offset - 2, offset) === '  ') {
                currentDoc = initializeDocument(document, offset)
                // move cursor position into new empty object
                position.character += 1
            } else {
                // adjust cursor back after parsing to keep it within States node
                position.character -= 1
            }
        }

        const aslCompletions = doCompleteAsl(document, position, currentDoc, yamlCompletions, {
            ignoreColonOffset: true,
        })

        aslCompletions.items.forEach(completion => {
            // format json completions for yaml
            if (completion.textEdit) {
                // textEdit can't be done on white-space so insert text is used instead
                if (atSpace) {
                    completion.insertText = completion.textEdit.newText
                    // remove any commas from json-completions
                    completion.insertText = completion.textEdit.newText.replace(/[\,]/g, '')
                    completion.textEdit = undefined
                } else {
                    completion.textEdit.range.start.character = position.character
                }
            } else {
                // remove null value auto-completions for 'string' nodes that don't support null values
                completion.insertText = completion?.insertText?.replace(/\$\{1:null\}/g, '')
            }
        })
        return Promise.resolve(aslCompletions)
    }

    languageService.doResolve = function(item: CompletionItem): Thenable<CompletionItem> {
        return aslLanguageService.doResolve(item)
    }

    languageService.doHover = function(
        document: TextDocument,
        position: Position,
        jsonDocument: JSONDocument
    ): Thenable<Hover | null> {
        const doc = parseYAML(document.getText())
        const offset = document.offsetAt(position)
        const currentDoc = matchOffsetToDocument(offset, doc)
        if (!currentDoc) {
            return Promise.resolve(null)
        }

        const currentDocIndex = doc.documents.indexOf(currentDoc)
        currentDoc.currentDocIndex = currentDocIndex

        return aslLanguageService.doHover(document, position, currentDoc)
    }

    languageService.format = function(document: TextDocument, range: Range, options: FormattingOptions): TextEdit[] {
        try {
            const text = document.getText()

            const formatted = prettier.format(text, { parser: 'yaml' })

            return [TextEdit.replace(Range.create(Position.create(0, 0), document.positionAt(text.length)), formatted)]
        } catch (error) {
            return []
        }
    }

    languageService.findDocumentSymbols = function(document: TextDocument): SymbolInformation[] {
        const doc = parseYAML(document.getText())
        if (!doc || doc['documents'].length === 0) {
            return []
        }

        let results: any[] = []
        for (const yamlDoc of doc['documents']) {
            if (yamlDoc.root) {
                results = results.concat(aslLanguageService.findDocumentSymbols(document, yamlDoc))
            }
        }

        return results
    }

    languageService.findDocumentSymbols2 = function(document: TextDocument): DocumentSymbol[] {
        const doc = parseYAML(document.getText())
        if (!doc || doc['documents'].length === 0) {
            return []
        }

        let results: any[] = []
        for (const yamlDoc of doc['documents']) {
            if (yamlDoc.root) {
                results = results.concat(aslLanguageService.findDocumentSymbols2(document, yamlDoc))
            }
        }

        return results
    }

    // initialize brackets to surround the empty space when parsing
    const initializeDocument = function(text: TextDocument, offset: number) {
        const newText = text.getText().substring(0, offset) + '{}\r' + text.getText().substr(offset)
        return matchOffsetToDocument(offset, parseYAML(newText))
    }

    return languageService
}
