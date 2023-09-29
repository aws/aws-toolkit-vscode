/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { UtgStrategy, fetchSupplementalContextForTest } from './utgUtils'
import { CrossFileStrategy, fetchSupplementalContextForSrc } from './crossFileContextUtil'
import { isTestFile } from './codeParsingUtil'
import { DependencyGraphFactory } from '../dependencyGraph/dependencyGraphFactory'
import * as vscode from 'vscode'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { ToolkitError } from '../../../shared/errors'
import { getLogger } from '../../../shared/logger/logger'

const performance = globalThis.performance ?? require('perf_hooks').performance

export type SupplementalContextStrategy = CrossFileStrategy | UtgStrategy | 'Empty'

export interface CodeWhispererSupplementalContext {
    isUtg: boolean
    isProcessTimeout: boolean
    supplementalContextItems: CodeWhispererSupplementalContextItem[]
    contentsLength: number
    latency: number
    strategy: SupplementalContextStrategy
}

export interface CodeWhispererSupplementalContextItem {
    content: string
    filePath: string
    score?: number
}

export async function fetchSupplementalContext(
    editor: vscode.TextEditor,
    cancellationToken: vscode.CancellationToken
): Promise<CodeWhispererSupplementalContext | undefined> {
    const timesBeforeFetching = performance.now()
    const dependencyGraph = DependencyGraphFactory.getDependencyGraph(editor.document.languageId)

    const isUtg = await isTestFile(editor.document.uri.fsPath, {
        languageId: editor.document.languageId,
        dependencyGraph: dependencyGraph,
        fileContent: editor.document.getText(),
    })

    let supplementalContextPromise: Promise<
        Pick<CodeWhispererSupplementalContext, 'supplementalContextItems' | 'strategy'> | undefined
    >

    if (isUtg) {
        supplementalContextPromise = fetchSupplementalContextForTest(editor, cancellationToken)
    } else {
        supplementalContextPromise = fetchSupplementalContextForSrc(editor, cancellationToken)
    }

    return supplementalContextPromise
        .then(value => {
            if (value) {
                return {
                    isUtg: isUtg,
                    isProcessTimeout: false,
                    supplementalContextItems: value.supplementalContextItems,
                    contentsLength: value.supplementalContextItems.reduce((acc, curr) => acc + curr.content.length, 0),
                    latency: performance.now() - timesBeforeFetching,
                    strategy: value.strategy,
                }
            } else {
                return undefined
            }
        })
        .catch(err => {
            if (err instanceof ToolkitError && err.cause instanceof CancellationError) {
                return {
                    isUtg: isUtg,
                    isProcessTimeout: true,
                    supplementalContextItems: [],
                    contentsLength: 0,
                    latency: performance.now() - timesBeforeFetching,
                    strategy: 'Empty',
                }
            } else {
                getLogger().error(
                    `Fail to fetch supplemental context for target file ${editor.document.fileName}: ${err}`
                )
                return undefined
            }
        })
}
