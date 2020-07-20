/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as AsyncLock from 'async-lock'
import { LogStreamRegistry } from '../registry/logStreamRegistry'
import { getLogger } from '../../shared/logger/logger'

// TODO: Does this set maxPending for each key to 1, or to all keys?
// If the latter, we need to make a key registry...
const lock = new AsyncLock({ maxPending: 1 })

export async function addLogEvents(
    document: vscode.TextDocument,
    registry: LogStreamRegistry,
    headOrTail: 'head' | 'tail',
    onDidChangeCodeLensEvent?: vscode.EventEmitter<void>
): Promise<void> {
    const uri = document.uri
    const lockName = `${headOrTail === 'head' ? 'logStreamHeadLock' : 'logStreamTailLock'}:${uri.path}`

    lock.acquire(lockName, async () => {
        // TODO: Find a way to force this to fire and run through codelens provider prior to updateLog call?
        // Currently EXTREMELY unreliable that the event signaling that the busy status is set occurs before updateLog completes.
        registry.setBusyStatus(uri, true)
        if (onDidChangeCodeLensEvent) {
            onDidChangeCodeLensEvent.fire()
        }
        await registry.updateLog(uri, headOrTail)
    })
        .then(() => {
            registry.setBusyStatus(uri, false)
            if (onDidChangeCodeLensEvent) {
                onDidChangeCodeLensEvent.fire()
            }
        })
        .catch(err => {
            // triggers error statement if lock queue is exceeded.
            // No need to fire event for cleanup as the actively busy async function will handle it.
            getLogger().debug(`addLogEventseady locked for lock: ${lockName}`)
        })
}
