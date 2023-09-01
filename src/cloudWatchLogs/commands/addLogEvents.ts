/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { LogDataRegistry } from '../registry/logDataRegistry'
import { CancellationError } from '../../shared/utilities/timeoutUtils'

/**
 * Extends (appends/prepends) an existing log stream or log group search results
 * document with "older" or "newer" results.
 */
export async function addLogEvents(
    document: vscode.TextDocument,
    registry: LogDataRegistry,
    direction: 'head' | 'tail',
    onDidChangeCodeLensEvent: vscode.EventEmitter<void>
): Promise<void> {
    const uri = document.uri
    if (registry.getBusyStatus(uri)) {
        getLogger().debug(`cloudwatch logs: skipping addLogEvents(), URI is busy: ${uri}`)
        return
    }
    try {
        registry.setBusyStatus(uri, true)
        if (onDidChangeCodeLensEvent) {
            onDidChangeCodeLensEvent.fire()
        }
        await registry.fetchNextLogEvents(uri, false, direction)
        getLogger().debug('cloudwatch logs: "Load newer/older" codelens done...')
    } catch (e) {
        if (CancellationError.isUserCancelled(e)) {
            getLogger().debug('cwl: user cancelled')
        } else {
            throw e
        }
    } finally {
        registry.setBusyStatus(uri, false)
        if (onDidChangeCodeLensEvent) {
            onDidChangeCodeLensEvent.fire()
        }
    }
}
