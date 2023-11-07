/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { References } from '../client/codewhisperer'
import * as CodeWhispererConstants from '../models/constants'

interface CodeReference {
    code: string
    references: References
}

export class ReferenceHoverProvider implements vscode.HoverProvider {
    private _codeReferenceCache: CodeReference[] = []
    static #instance: ReferenceHoverProvider

    public static get instance() {
        return (this.#instance ??= new this())
    }
    public provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): vscode.Hover | undefined {
        const cursorOffset = document.offsetAt(position)
        for (const codeRef of this._codeReferenceCache) {
            for (const reference of codeRef.references) {
                let refLength = codeRef.code.length
                let refCode = codeRef.code
                if (
                    reference.recommendationContentSpan !== undefined &&
                    reference.recommendationContentSpan.start !== undefined &&
                    reference.recommendationContentSpan.end !== undefined
                ) {
                    refLength = reference.recommendationContentSpan.end - reference.recommendationContentSpan.start
                    refCode = codeRef.code.substring(
                        reference.recommendationContentSpan.start,
                        reference.recommendationContentSpan.end
                    )
                }
                const leftOffset = Math.max(cursorOffset - refLength, 0)
                const rightOffset = cursorOffset + refLength
                const subDocument = document.getText(
                    new vscode.Range(document.positionAt(leftOffset), document.positionAt(rightOffset))
                )
                const index = subDocument.indexOf(refCode)
                if (index !== -1) {
                    return new vscode.Hover(
                        CodeWhispererConstants.hoverInlayText(reference.licenseName, reference.repository),
                        new vscode.Range(
                            document.positionAt(leftOffset + index),
                            document.positionAt(leftOffset + index + refCode.length)
                        )
                    )
                }
            }
        }
        return undefined
    }

    public addCodeReferences(code: string, references: References) {
        this._codeReferenceCache.push({ code, references })
        if (this._codeReferenceCache.length > 1000) {
            getLogger().warn(`_codeReferenceCache has size ${this._codeReferenceCache.length} more than 1k`)
            this._codeReferenceCache.shift()
        }
    }
}
