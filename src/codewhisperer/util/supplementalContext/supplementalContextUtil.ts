/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { fetchSupplementalContextForTest } from './utgUtils'
import { fetchSupplementalContextForSrc } from './crossFileContextUtil'
import { isTestFile } from './codeParsingUtil'
import { DependencyGraphFactory } from '../dependencyGraph/dependencyGraphFactory'
import * as vscode from 'vscode'
import * as codewhispererClient from '../../client/codewhisperer'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { ToolkitError } from '../../../shared/errors'
import { getLogger } from '../../../shared/logger/logger'

const performance = globalThis.performance ?? require('perf_hooks').performance

export interface CodeWhispererSupplementalContext {
    isUtg: boolean
    isProcessTimeout: boolean
    contents: codewhispererClient.SupplementalContext[]
    contentsLength: number
    latency: number
}

export async function fetchSupplementalContext(
    editor: vscode.TextEditor,
    cancellationToken: vscode.CancellationToken
): Promise<CodeWhispererSupplementalContext | undefined> {
    const timesBeforeFetching = performance.now()
    const dependencyGraph = DependencyGraphFactory.getDependencyGraph(editor.document.languageId)

    if (dependencyGraph === undefined) {
        // This is a general check for language support of CW.
        // We perform feature level language filtering later.
        return undefined
    }

    const isUtg = await isTestFile(editor, dependencyGraph)
    let supplementalContextPromise: Promise<codewhispererClient.SupplementalContext[] | undefined>

    if (isUtg) {
        supplementalContextPromise = fetchSupplementalContextForTest(editor, dependencyGraph, cancellationToken)
    } else {
        supplementalContextPromise = fetchSupplementalContextForSrc(editor, dependencyGraph, cancellationToken)
    }

    return supplementalContextPromise
        .then(value => {
            if (value) {
                return {
                    isUtg: isUtg,
                    isProcessTimeout: false,
                    contents: value,
                    contentsLength: value.reduce((acc, curr) => acc + curr.content.length, 0),
                    latency: performance.now() - timesBeforeFetching,
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
                    contents: [],
                    contentsLength: 0,
                    latency: performance.now() - timesBeforeFetching,
                }
            } else {
                getLogger().error(
                    `Fail to fetch supplemental context for target file ${editor.document.fileName}: ${err}`
                )
                return undefined
            }
        })
}
