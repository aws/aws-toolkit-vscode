/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as CodeWhispererConstants from '../models/constants'
import { getLogger } from '../../shared/logger'
import { References } from '../client/codewhisperer'
import { LicenseUtil } from '../util/licenseUtil'
import { isInlineCompletionEnabled } from '../util/commonUtil'
import { application } from '../util/codeWhispererApplication'
import { placeholder } from '../../shared/vscode/commands2'

/**
 * ReferenceInlineProvider
 */
export class ReferenceInlineProvider implements vscode.CodeLensProvider {
    public ranges: vscode.Range[] = []
    public refs: string[] = []

    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event

    constructor() {
        application().clearCodeWhispererUIListener(_ => {
            this.removeInlineReference()
        })
    }

    static #instance: ReferenceInlineProvider

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public setInlineReference(line: number, suggestion: string, references: References | undefined) {
        const startTime = performance.now()
        this.ranges = []
        this.refs = []
        if (
            (suggestion.includes(CodeWhispererConstants.lineBreak) ||
                suggestion.includes(CodeWhispererConstants.lineBreakWin)) &&
            !isInlineCompletionEnabled()
        ) {
            line = line + 1
        }
        const n = LicenseUtil.getUniqueLicenseNames(references)
        if (n.size === 0) {
            this._onDidChangeCodeLenses.fire()
            return
        }
        const licenses = [...n].join(', ')
        this.ranges.push(new vscode.Range(line, 0, line, 1))
        this.refs.push(CodeWhispererConstants.suggestionDetailReferenceText(licenses))
        const duration = performance.now() - startTime
        if (duration > 100) {
            getLogger().warn(`setInlineReference takes ${duration}ms`)
        }
        this._onDidChangeCodeLenses.fire()
    }

    public removeInlineReference() {
        this.ranges = []
        this.refs = []
        this._onDidChangeCodeLenses.fire()
    }

    public provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        const startTime = performance.now()
        const codeLenses: vscode.CodeLens[] = []
        for (let i = 0; i < this.ranges.length; i++) {
            const codeLens = new vscode.CodeLens(this.ranges[i])
            codeLens.command = {
                title: this.refs[i],
                tooltip: 'Reference code',
                command: 'aws.amazonq.openReferencePanel',
                arguments: [placeholder, 'codelens'],
            }
            codeLenses.push(codeLens)
        }
        const duration = performance.now() - startTime
        if (duration > 100) {
            getLogger().warn(`setInlineReference takes ${duration}ms`)
        }
        return codeLenses
    }
}
