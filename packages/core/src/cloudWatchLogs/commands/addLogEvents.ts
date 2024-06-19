/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import AsyncLock from 'async-lock'
import { getLogger } from '../../shared/logger/logger'
import { LogDataRegistry } from '../registry/logDataRegistry'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { localize } from 'vscode-nls'

// TODO: Cut a PR to the async-lock package?...as of now, maxPending = 0 is theoretically ideal, but also falsy (which sets maxPending = 1000):
// https://github.com/rogierschouten/async-lock/blob/78cb0c2441650d7bdc148548f99542ccc9c93fd7/lib/index.js#L19
const lock = new AsyncLock({ maxPending: 1 })

export async function addLogEvents(
    document: vscode.TextDocument,
    registry: LogDataRegistry,
    headOrTail: 'head' | 'tail',
    onDidChangeCodeLensEvent: vscode.EventEmitter<void>
): Promise<void> {
    const uri = document.uri
    const lockName = `${headOrTail === 'head' ? 'logHeadLock' : 'logTailLock'}:${uri.path}`

    if (lock.isBusy(lockName)) {
        getLogger().debug(`addLogEvents already locked for lock: ${lockName}`)
        return
    }

    try {
        await lock.acquire(lockName, async () => {
            // TODO: Find a way to force this to fire and run through codelens provider prior to updateLog call?
            // Currently EXTREMELY unreliable that the event signaling that the busy status is set occurs before updateLog completes.
            registry.setBusyStatus(uri, true)
            if (onDidChangeCodeLensEvent) {
                onDidChangeCodeLensEvent.fire()
            }
            await registry.fetchNextLogEvents(uri, headOrTail)
            getLogger().debug('Update done, releasing lock...')
        })
    } catch (e) {
        if (CancellationError.isUserCancelled(e)) {
            getLogger().debug('cwl: User Cancelled Search')
        } else {
            // contingency in case lock isn't busy but still locked out. Don't want to accidentally trigger making codelens not busy
            const error = e as Error
            void vscode.window.showErrorMessage(
                localize(
                    'AWS.cwl.searchLogGroup.errorRetrievingLogs2',
                    'Failed to get logs for {0}: {1}',
                    uri.path,
                    error.message
                )
            )
        }
    } finally {
        registry.setBusyStatus(uri, false)
        if (onDidChangeCodeLensEvent) {
            onDidChangeCodeLensEvent.fire()
        }
    }
}
