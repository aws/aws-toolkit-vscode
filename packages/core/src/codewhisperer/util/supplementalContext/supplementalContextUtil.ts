/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { fetchSupplementalContextForTest } from './utgUtils'
import { fetchSupplementalContextForSrc } from './crossFileContextUtil'
import { isTestFile } from './codeParsingUtil'
import * as vscode from 'vscode'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { ToolkitError } from '../../../shared/errors'
import { getLogger } from '../../../shared/logger/logger'
import { CodeWhispererSupplementalContext } from '../../models/model'
import * as os from 'os'
import { crossFileContextConfig } from '../../models/constants'

export async function fetchSupplementalContext(
    editor: vscode.TextEditor,
    cancellationToken: vscode.CancellationToken
): Promise<CodeWhispererSupplementalContext | undefined> {
    const timesBeforeFetching = performance.now()

    const isUtg = await isTestFile(editor.document.uri.fsPath, {
        languageId: editor.document.languageId,
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
        .then((value) => {
            if (value) {
                const resBeforeTruncation = {
                    isUtg: isUtg,
                    isProcessTimeout: false,
                    supplementalContextItems: value.supplementalContextItems.filter(
                        (item) => item.content.trim().length !== 0
                    ),
                    contentsLength: value.supplementalContextItems.reduce((acc, curr) => acc + curr.content.length, 0),
                    latency: performance.now() - timesBeforeFetching,
                    strategy: value.strategy,
                }

                return truncateSuppelementalContext(resBeforeTruncation)
            } else {
                return undefined
            }
        })
        .catch((err) => {
            if (err instanceof ToolkitError && err.cause instanceof CancellationError) {
                return {
                    isUtg: isUtg,
                    isProcessTimeout: true,
                    supplementalContextItems: [],
                    contentsLength: 0,
                    latency: performance.now() - timesBeforeFetching,
                    strategy: 'empty',
                }
            } else {
                getLogger().error(
                    `Fail to fetch supplemental context for target file ${editor.document.fileName}: ${err}`
                )
                return undefined
            }
        })
}

/**
 * Requirement
 * - Maximum 5 supplemental context.
 * - Each chunk can't exceed 10240 characters
 * - Sum of all chunks can't exceed 20480 characters
 */
export function truncateSuppelementalContext(
    context: CodeWhispererSupplementalContext
): CodeWhispererSupplementalContext {
    let c = context.supplementalContextItems.map((item) => {
        if (item.content.length > crossFileContextConfig.maxLengthEachChunk) {
            return {
                ...item,
                content: truncateLineByLine(item.content, crossFileContextConfig.maxLengthEachChunk),
            }
        } else {
            return item
        }
    })

    if (c.length > crossFileContextConfig.maxContextCount) {
        c = c.slice(0, crossFileContextConfig.maxContextCount)
    }

    let curTotalLength = c.reduce((acc, cur) => {
        return acc + cur.content.length
    }, 0)
    while (curTotalLength >= 20480) {
        const last = c[c.length - 1]
        c = c.slice(0, -1)
        curTotalLength -= last.content.length
    }

    return {
        ...context,
        supplementalContextItems: c,
        contentsLength: curTotalLength,
    }
}

export function truncateLineByLine(input: string, l: number): string {
    const maxLength = l > 0 ? l : -1 * l
    if (input.length === 0) {
        return ''
    }

    const shouldAddNewLineBack = input[input.length - 1] === os.EOL
    let lines = input.trim().split(os.EOL)
    let curLen = input.length
    while (curLen > maxLength) {
        const last = lines[lines.length - 1]
        lines = lines.slice(0, -1)
        curLen -= last.length + 1
    }

    const r = lines.join(os.EOL)
    if (shouldAddNewLineBack) {
        return r + os.EOL
    } else {
        return r
    }
}
