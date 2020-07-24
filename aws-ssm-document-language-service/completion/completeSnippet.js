'use strict'
/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
var __importDefault =
    (this && this.__importDefault) ||
    function(mod) {
        return mod && mod.__esModule ? mod : { default: mod }
    }
Object.defineProperty(exports, '__esModule', { value: true })
exports.getYAMLActionSnippetsCompletion = exports.getJSONParameterSnippetsCompletion = void 0
const vscode_json_languageservice_1 = require('vscode-json-languageservice')
const astFunctions_1 = require('../util/astFunctions')
const parameterObject_json_1 = __importDefault(require('../json-schema/partial/parameterObject.json'))
/**
 * @param str JSON object of snippet body stringified with '\t'
 * @returns same stringified object with 1. start and end {} removed and 2. indentation fixed
 */
function getParameterSnippetsInsertText(str) {
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
function getJSONParameterSnippetsCompletion(document, position, doc) {
    // only suggest for json docs because yaml docs are taken care by defaultSnippets in the json schema
    if (document.languageId === 'ssm-json') {
        const rootNode = astFunctions_1.findRootNode(document, doc)
        if (!rootNode) {
            return []
        }
        const offset = document.offsetAt(position)
        const currNode = astFunctions_1.findCurrentNode(rootNode, offset)
        if (!currNode) {
            return []
        }
        if (!astFunctions_1.suggestParametersSnippets(currNode, offset)) {
            return []
        }
        const result = []
        parameterObject_json_1.default.definitions.additionalProperties.defaultSnippets.forEach(snippet => {
            const rawText = JSON.stringify(snippet.body, undefined, '\t')
            const insertText = getParameterSnippetsInsertText(rawText)
            result.push({
                label: snippet.label,
                detail: snippet.description,
                kind: vscode_json_languageservice_1.CompletionItemKind.Snippet,
                insertText: insertText,
            })
        })
        return result
    }
    return []
}
exports.getJSONParameterSnippetsCompletion = getJSONParameterSnippetsCompletion
/** YAML language server cannot parse snippets' insertText correctly from JSON object defined in
 *  the defaultSnippets property of JSON Schema, so this function changes completion items provided
 *  by the YAML language server to the correct form
 *  Problems:
 *      1. {{ VARIABLE }} will cause syntax errors in YAML
 *      2. snippets with string arrays will be parsed into a list characters
 *  Fixes:
 *      replace the insertText with YAML.stringify(snippet.body)
 */
function getYAMLActionSnippetsCompletion(snippets, items) {
    return items.map(item => {
        const insertText = snippets.get(item.label)
        if (insertText) {
            return Object.assign(Object.assign({}, item), { insertText: insertText, textEdit: undefined })
        }
        return item
    })
}
exports.getYAMLActionSnippetsCompletion = getYAMLActionSnippetsCompletion
//# sourceMappingURL=completeSnippet.js.map
