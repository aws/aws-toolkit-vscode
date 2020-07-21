/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */

import { CompletionItem, CompletionItemKind, JSONDocument, Position, TextDocument } from 'vscode-json-languageservice'
import { findCurrentNode, findRootNode, suggestParametersSnippets } from '../util/astFunctions'

import parameterObject from '../json-schema/partial/parameterObject.json'

/**
 * @param str JSON object of snippet body stringified with '\t'
 * @returns same stringified object with 1. start and end {} removed and 2. indentation fixed
 */
function getParameterSnippetsInsertText(str: string) {
    // remove start and end {}
    let stringList = str.split('\n')
    stringList = stringList.slice(1, stringList.length - 1)

    // remove the starting \t from each line
    stringList = stringList.map(item => {
        return item.substr(1)
    })

    return stringList.join('\n')
}

/** Check whether parameter snippets should be suggested at current position,
 *  and return the CompletionItem[] for parameter snippets
 */
export function getJSONParameterSnippetsCompletion(
    document: TextDocument,
    position: Position,
    doc?: JSONDocument
): CompletionItem[] {
    // only suggest for json docs because yaml docs are taken care by defaultSnippets in the json schema
    if (document.languageId === 'ssm-json') {
        const rootNode = findRootNode(document, doc)
        if (!rootNode) {
            return []
        }

        const offset = document.offsetAt(position)
        const currNode = findCurrentNode(rootNode, offset)
        if (!currNode) {
            return []
        }

        if (!suggestParametersSnippets(currNode, offset)) {
            return []
        }

        const result: CompletionItem[] = []
        parameterObject.definitions.additionalProperties.defaultSnippets.forEach(snippet => {
            const rawText = JSON.stringify(snippet.body, undefined, '\t')
            const insertText = getParameterSnippetsInsertText(rawText)
            result.push({
                label: snippet.label,
                detail: snippet.description,
                kind: CompletionItemKind.Snippet,
                insertText: insertText,
            })
        })

        return result
    }

    return []
}

/** YAML language server cannot parse snippets' insertText correctly from JSON object defined in
 *  the defaultSnippets property of JSON Schema, so this function changes completion items provided
 *  by the YAML language server to the correct form
 *  Problems:
 *      1. {{ VARIABLE }} will cause syntax errors in YAML
 *      2. snippets with string arrays will be parsed into a list characters
 *  Fixes:
 *      replace the insertText with YAML.stringify(snippet.body)
 */
export function getYAMLActionSnippetsCompletion(
    snippets: Map<string, string>,
    items: CompletionItem[]
): CompletionItem[] {
    return items.map(item => {
        const insertText: string | undefined = snippets.get(item.label)
        if (insertText) {
            return {
                ...item,
                insertText: insertText,
                textEdit: undefined,
            }
        }

        return item
    })
}
