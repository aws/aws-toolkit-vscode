/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TextDocument, CompletionItem, CompletionItemKind } from 'vscode-json-languageservice'

import * as json2_2SnippetRaw from './resources/snippets/jsonSnippets/schemaVersion2.2.json'
import * as json1_2SnippetRaw from './resources/snippets/jsonSnippets/schemaVersion1.2.json'
import * as json0_3SnippetRaw from './resources/snippets/jsonSnippets/schemaVersion0.3.json'

import * as yaml2_2SnippetRaw from './resources/snippets/yamlSnippets/schemaVersion2.2.json'
import * as yaml1_2SnippetRaw from './resources/snippets/yamlSnippets/schemaVersion1.2.json'
import * as yaml0_3SnippetRaw from './resources/snippets/yamlSnippets/schemaVersion0.3.json'

interface Snippet {
    name: string
    body: string[]
    description: string
}

function parseSnippetFromJson(json: Snippet[]): CompletionItem[] {
    return json.map(snippet => {
        const item = CompletionItem.create(snippet.name)
        item.kind = CompletionItemKind.Snippet
        item.insertText = snippet.body.join('\n')
        item.documentation = snippet.description
        item.detail = 'Insert Code Snippet'
        return item
    })
}

export function getSsmActionCompletion(document: TextDocument): CompletionItem[] {
    const docText = document.getText()
    const schemaVersion: string = findSchemaVersion(docText)

    if (schemaVersion === '0.3') {
        if (document.languageId === 'json') {
            // return parseSnippetFromJson(json0_3SnippetRaw)
        } else if (document.languageId === 'yaml') {
            // return parseSnippetFromJson(yaml0_3SnippetRaw)
        }
    } else if (schemaVersion === '1.2') {
        if (document.languageId === 'json') {
            return parseSnippetFromJson(json1_2SnippetRaw)
        } else if (document.languageId === 'yaml') {
            return parseSnippetFromJson(yaml1_2SnippetRaw)
        }
    } else if (schemaVersion === '2.2') {
        if (document.languageId === 'json') {
            return parseSnippetFromJson(json2_2SnippetRaw)
        } else if (document.languageId === 'yaml') {
            return parseSnippetFromJson(yaml2_2SnippetRaw)
        }
    }

    return []
}

function findSchemaVersion(docText: string): string {
    const pos = docText.indexOf('schemaVersion')
    if (pos === -1) {
        return ''
    }

    const varPattern = /[0-9]\.[0-9]/g
    let match: RegExpExecArray | null = varPattern.exec(docText.substr(pos))
    if (!match) {
        return ''
    }

    return match[0]
}
