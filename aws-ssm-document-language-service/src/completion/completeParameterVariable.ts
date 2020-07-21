/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */

import {
    CompletionItem,
    CompletionItemKind,
    InsertTextFormat,
    JSONDocument,
    ObjectASTNode,
    Position,
    PropertyASTNode,
    Range,
    TextDocument,
} from 'vscode-json-languageservice'
import { findCurrentNode, findRootNode, isObjectNode, suggestParameterNames } from '../util/astFunctions'
import { findRegPattern, getVariableName } from '../util/util'

/** Check whether parameter names should be suggested at current position,
 *  and return the CompletionItem[] for parameter names
 */
export function getParameterNameCompletion(
    document: TextDocument,
    position: Position,
    doc?: JSONDocument
): CompletionItem[] {
    const varPattern = /{{[ ]?\w+[ ]?}}/g
    const params = findRegPattern(document, varPattern)
    const paramNames = params.map(param => {
        return getVariableName(param.value)
    })
    if (!paramNames || !paramNames.length) {
        return []
    }

    const rootNode = findRootNode(document, doc)
    if (!rootNode) {
        return []
    }

    const offset = document.offsetAt(position)
    const currNode = findCurrentNode(rootNode, offset)
    if (!currNode) {
        return []
    }

    if (!suggestParameterNames(currNode, offset)) {
        return []
    }

    const result: CompletionItem[] = []

    // find and filter out existing parameters
    let existingParams: string[] = []

    const parametersNode = (rootNode as ObjectASTNode).properties.find(node => node.keyNode.value === 'parameters')
    if (!!parametersNode && parametersNode.valueNode && isObjectNode(parametersNode.valueNode)) {
        const parameters = (parametersNode.valueNode as ObjectASTNode).properties
        existingParams = parameters.map(param => {
            return param.keyNode.value
        })
    }

    const suggestNames = paramNames.filter(param => !existingParams.includes(param))

    if (document.languageId === 'ssm-json') {
        let range: Range | undefined
        if (currNode.parent) {
            const startOffset = (currNode.parent as PropertyASTNode).offset
            const colonOffset = (currNode.parent as PropertyASTNode).colonOffset
            const startPos = document.positionAt(startOffset)
            const colonPos = document.positionAt(colonOffset)

            if (colonOffset !== -1) {
                range = Range.create(startPos, colonPos)
            }
        }

        suggestNames.forEach(param => {
            const item: CompletionItem = {
                label: `"${param}"`,
                kind: CompletionItemKind.Property,
                detail: `parameter {{ ${param} }}`,
            }

            if (range) {
                item.textEdit = {
                    range: range,
                    newText: `"${param}"`,
                }
            } else {
                item.insertText = `"${param}": {$0}`
                item.insertTextFormat = InsertTextFormat.Snippet
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
                kind: CompletionItemKind.Property,
                insertText: `${param}${colonFound ? '' : ':\n\t'}`,
                detail: `parameter {{ ${param} }}`,
            })
        })
    }

    return result
}
