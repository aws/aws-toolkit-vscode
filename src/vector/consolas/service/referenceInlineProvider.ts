/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ConsolasConstants } from '../models/constants'
import { getLogger } from '../../../shared/logger'
import { InlineCompletionItem } from '../models/model'
import { References } from '../client/consolas'
import { LicenseUtil } from '../util/licenseUtil'

//if this is browser it uses browser and if it's node then it uses nodes
//TODO remove when node version >= 16
const performance = globalThis.performance ?? require('perf_hooks').performance

/**
 * ReferenceInlineProvider
 */
export class ReferenceInlineProvider implements vscode.CodeLensProvider {
    public ranges: vscode.Range[] = []
    public refs: string[] = []
    constructor() {}

    public setInlineReference(line: number, item: InlineCompletionItem, references: References | undefined) {
        const startTime = performance.now()
        this.removeInlineReference()
        if (
            item.content.includes(ConsolasConstants.lineBreak) ||
            item.content.includes(ConsolasConstants.lineBreakWin)
        ) {
            line = line + 1
        }
        const n = LicenseUtil.getUniqueLicenseNames(references)
        if (n.size === 0) return
        const licenses = [...n].join(', ')
        this.ranges.push(new vscode.Range(line, 0, line, 1))
        this.refs.push(ConsolasConstants.suggestionDetailReferenceText(licenses))
        const duration = performance.now() - startTime
        if (duration > 100) {
            getLogger().warn(`setInlineReference takes ${duration}ms`)
        }
    }

    public removeInlineReference() {
        this.ranges = []
        this.refs = []
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
                command: 'aws.consolas.openReferencePanel',
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
