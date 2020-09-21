'use strict'
/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
Object.defineProperty(exports, '__esModule', { value: true })
exports.getParameterNameCompletion = void 0
const vscode_json_languageservice_1 = require('vscode-json-languageservice')
const astFunctions_1 = require('../util/astFunctions')
const util_1 = require('../util/util')
/** Check whether parameter names should be suggested at current position,
 *  and return the CompletionItem[] for parameter names
 */
function getParameterNameCompletion(document, position, doc) {
    const varPattern = /{{[ ]?\w+[ ]?}}/g
    const params = util_1.findRegPattern(document, varPattern)
    const paramNames = params.map(param => {
        return util_1.getVariableName(param.value)
    })
    if (!paramNames || !paramNames.length) {
        return []
    }
    const rootNode = astFunctions_1.findRootNode(document, doc)
    if (!rootNode) {
        return []
    }
    const offset = document.offsetAt(position)
    const currNode = astFunctions_1.findCurrentNode(rootNode, offset)
    if (!currNode) {
        return []
    }
    if (!astFunctions_1.suggestParameterNames(currNode, offset)) {
        return []
    }
    const result = []
    // find and filter out existing parameters
    let existingParams = []
    const parametersNode = rootNode.properties.find(node => node.keyNode.value === 'parameters')
    if (!!parametersNode && parametersNode.valueNode && astFunctions_1.isObjectNode(parametersNode.valueNode)) {
        const parameters = parametersNode.valueNode.properties
        existingParams = parameters.map(param => {
            return param.keyNode.value
        })
    }
    const suggestNames = paramNames.filter(param => !existingParams.includes(param))
    if (document.languageId === 'ssm-json') {
        let range
        if (currNode.parent) {
            const startOffset = currNode.parent.offset
            const colonOffset = currNode.parent.colonOffset
            const startPos = document.positionAt(startOffset)
            const colonPos = document.positionAt(colonOffset)
            if (colonOffset !== -1) {
                range = vscode_json_languageservice_1.Range.create(startPos, colonPos)
            }
        }
        suggestNames.forEach(param => {
            const item = {
                label: `"${param}"`,
                kind: vscode_json_languageservice_1.CompletionItemKind.Property,
                detail: `parameter {{ ${param} }}`,
            }
            if (range) {
                item.textEdit = {
                    range: range,
                    newText: `"${param}"`,
                }
            } else {
                item.insertText = `"${param}": {$0}`
                item.insertTextFormat = vscode_json_languageservice_1.InsertTextFormat.Snippet
            }
            result.push(item)
        })
    } else if (document.languageId === 'ssm-yaml') {
        // propertyNode.colonOffset does not work for YAML
        const lineEndOffset = document.offsetAt({
            line: position.line + 1,
            character: 0,
        })
        const docText = document.getText()
        const colonFound = docText.substring(offset, lineEndOffset).includes(':')
        suggestNames.forEach(param => {
            result.push({
                label: `${param}`,
                kind: vscode_json_languageservice_1.CompletionItemKind.Property,
                insertText: `${param}${colonFound ? '' : ':\n\t'}`,
                detail: `parameter {{ ${param} }}`,
            })
        })
    }
    return result
}
exports.getParameterNameCompletion = getParameterNameCompletion
//# sourceMappingURL=completeParameterVariable.js.map
