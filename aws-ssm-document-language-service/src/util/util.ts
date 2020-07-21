/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */

import { Position, TextDocument } from 'vscode-json-languageservice'
import * as YAML from 'yaml'

export function findDocumentType(document: TextDocument): string {
    const uriSplitArr = document.uri.split('/')
    const filename = uriSplitArr[uriSplitArr.length - 1].toLocaleLowerCase()
    // filename should have format of *.<document type>.ssm.{json, yaml}
    const extSplitArr = filename.split('.')

    if (extSplitArr.length < 3) {
        return ''
    }

    return extSplitArr[extSplitArr.length - 3]
}

export function findSchemaVersion(docText: string): string {
    const pos = docText.indexOf('schemaVersion')
    if (pos === -1) {
        return ''
    }

    const varPattern = /[0-9]\.[0-9]/g
    const match: RegExpExecArray | null = varPattern.exec(docText.substr(pos))
    if (!match) {
        return ''
    }

    return match[0]
}

export function parseDocument(textDocument: TextDocument): any {
    let obj: any
    if (textDocument.languageId === 'ssm-json') {
        obj = JSON.parse(textDocument.getText())
    } else {
        obj = YAML.parse(textDocument.getText())
    }

    return obj
}

/** @param text string in the form of {{ VARIABLE }} */
export function getVariableName(text: string) {
    const start = text.lastIndexOf('{') + 1
    const end = text.indexOf('}')

    return text.substring(start, end).trim()
}

export function findRegPattern(
    textDocument: TextDocument,
    pattern: RegExp
): {
    value: string
    start: Position
    end: Position
}[] {
    const docText = textDocument.getText()
    let vars: RegExpExecArray = pattern.exec(docText)
    const result: { value: string; start: Position; end: Position }[] = []

    while (vars) {
        result.push({
            value: vars[0],
            start: textDocument.positionAt(vars.index),
            end: textDocument.positionAt(vars.index + vars[0].length),
        })

        vars = pattern.exec(docText)
    }

    return result
}
