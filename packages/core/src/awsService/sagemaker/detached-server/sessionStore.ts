/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SsmConnectionInfo } from '../types'
import { readMapping, writeMapping } from './utils'

export type SessionStatus = 'pending' | 'fresh' | 'consumed' | 'not-started'

/**
 * Reads the mapping file and resolves the deepLink entry for the given connectionId.
 * Throws if the mapping or entry is missing.
 */
async function resolveDeepLinkEntry(connectionId: string) {
    const mapping = await readMapping()

    if (!mapping.deepLink) {
        throw new Error('No deepLink mapping found')
    }

    const entry = mapping.deepLink[connectionId]
    if (!entry) {
        throw new Error(`No mapping found for connectionId: "${connectionId}"`)
    }

    return { mapping, entry }
}

export class SessionStore {
    async getRefreshUrl(connectionId: string): Promise<string | undefined> {
        const { entry } = await resolveDeepLinkEntry(connectionId)
        return entry.refreshUrl
    }

    /** Returns true if this is a SMUS connection. Defaults to false for legacy entries. */
    async getIsSMUS(connectionId: string): Promise<boolean> {
        const { entry } = await resolveDeepLinkEntry(connectionId)
        return entry.isSMUS ?? false
    }

    async getFreshEntry(connectionId: string, requestId: string) {
        const { mapping, entry } = await resolveDeepLinkEntry(connectionId)

        const requests = entry.requests
        const initialEntry = requests['initial-connection']
        if (initialEntry?.status === 'fresh') {
            await this.markConsumed(connectionId, 'initial-connection')
            return initialEntry
        }

        const asyncEntry = requests[requestId]
        if (asyncEntry?.status === 'fresh') {
            delete requests[requestId]
            await writeMapping(mapping)
            return asyncEntry
        }

        return undefined
    }

    async getStatus(connectionId: string, requestId: string) {
        const { entry } = await resolveDeepLinkEntry(connectionId)
        const status = entry.requests?.[requestId]?.status
        return status ?? 'not-started'
    }

    async markConsumed(connectionId: string, requestId: string) {
        const { mapping, entry } = await resolveDeepLinkEntry(connectionId)

        const requests = entry.requests
        if (!requests[requestId]) {
            throw new Error(`No request entry found for requestId: "${requestId}"`)
        }

        requests[requestId].status = 'consumed'
        await writeMapping(mapping)
    }

    async markPending(connectionId: string, requestId: string) {
        const { mapping, entry } = await resolveDeepLinkEntry(connectionId)

        entry.requests[requestId] = {
            sessionId: '',
            token: '',
            url: '',
            status: 'pending',
        }

        await writeMapping(mapping)
    }

    async cleanupExpiredConnection(connectionId: string) {
        const mapping = await readMapping()

        if (!mapping.deepLink) {
            throw new Error('No deepLink mapping found')
        }

        // Remove the entire connection entry for the expired space
        if (mapping.deepLink[connectionId]) {
            delete mapping.deepLink[connectionId]
            await writeMapping(mapping)
        }
    }

    async setSession(connectionId: string, requestId: string, ssmConnectionInfo: SsmConnectionInfo) {
        const { mapping, entry } = await resolveDeepLinkEntry(connectionId)

        entry.requests[requestId] = {
            sessionId: ssmConnectionInfo.sessionId,
            token: ssmConnectionInfo.token,
            url: ssmConnectionInfo.url,
            status: ssmConnectionInfo.status ?? 'fresh',
        }

        await writeMapping(mapping)
    }
}
