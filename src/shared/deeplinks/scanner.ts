/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { parseAll, Arn } from './arn'

/**
 * Provides links in a document, derived from ARNs.
 */
export class ArnScanner implements vscode.DocumentLinkProvider {
    public constructor(private readonly redirect: (target: Arn) => vscode.Uri) {}

    public provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.DocumentLink[] {
        const links: vscode.DocumentLink[] = []

        for (let currentLine = 0; currentLine < document.lineCount && !token.isCancellationRequested; currentLine++) {
            const line = document.lineAt(currentLine)

            if (line.isEmptyOrWhitespace) {
                continue
            }

            for (const [range, result] of this.getCandidates(currentLine, line.text, token)) {
                const link = new vscode.DocumentLink(range, this.redirect(result.data))
                link.tooltip = localize('aws.deepLinks.documentLink.tooltip', 'Open resource in browser')
                links.push(link)
            }
        }

        return links
    }

    private *getCandidates(lineNumber: number, text: string, token: vscode.CancellationToken) {
        for (const result of parseAll(text)) {
            const range = new vscode.Range(lineNumber, result.offset, lineNumber, result.offset + result.text.length)
            yield [range, result] as const

            if (token.isCancellationRequested) {
                break
            }
        }
    }
}
