/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SsmConnectionInfo } from '../types'
import { readMapping, writeMapping } from './utils'

export type SessionStatus = 'pending' | 'fresh' | 'consumed' | 'not-started'

export class SessionStore {
    async getRefreshUrl(connectionId: string) {
        const mapping = await readMapping()

        if (!mapping.deepLink) {
            throw new Error('No deepLink mapping found')
        }

        const entry = mapping.deepLink[connectionId]
        if (!entry) {
            throw new Error(`No mapping found for connectionId: "${connectionId}"`)
        }

        if (!entry.refreshUrl) {
            throw new Error(`No refreshUrl found for connectionId: "${connectionId}"`)
        }

        return entry.refreshUrl
    }

    async getFreshEntry(connectionId: string, requestId: string) {
        const mapping = await readMapping()

        if (!mapping.deepLink) {
            throw new Error('No deepLink mapping found')
        }

        const entry = mapping.deepLink[connectionId]
        if (!entry) {
            throw new Error(`No mapping found for connectionId: "${connectionId}"`)
        }

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
        const mapping = await readMapping()

        if (!mapping.deepLink) {
            throw new Error('No deepLink mapping found')
        }
        const entry = mapping.deepLink[connectionId]
        if (!entry) {
            throw new Error(`No mapping found for connectionId: "${connectionId}"`)
        }

        const status = entry.requests?.[requestId]?.status
        return status ?? 'not-started'
    }

    async markConsumed(connectionId: string, requestId: string) {
        const mapping = await readMapping()

        if (!mapping.deepLink) {
            throw new Error('No deepLink mapping found')
        }
        const entry = mapping.deepLink[connectionId]
        if (!entry) {
            throw new Error(`No mapping found for connectionId: "${connectionId}"`)
        }

        const requests = entry.requests
        if (!requests[requestId]) {
            throw new Error(`No request entry found for requestId: "${requestId}"`)
        }

        requests[requestId].status = 'consumed'
        await writeMapping(mapping)
    }

    async markPending(connectionId: string, requestId: string) {
        const mapping = await readMapping()

        if (!mapping.deepLink) {
            throw new Error('No deepLink mapping found')
        }
        const entry = mapping.deepLink[connectionId]
        if (!entry) {
            throw new Error(`No mapping found for connectionId: "${connectionId}"`)
        }

        entry.requests[requestId] = {
            sessionId: '',
            token: '',
            url: '',
            status: 'pending',
        }

        await writeMapping(mapping)
    }

    async setSession(connectionId: string, requestId: string, ssmConnectionInfo: SsmConnectionInfo) {
        const mapping = await readMapping()

        if (!mapping.deepLink) {
            throw new Error('No deepLink mapping found')
        }
        const entry = mapping.deepLink[connectionId]
        if (!entry) {
            throw new Error(`No mapping found for connectionId: "${connectionId}"`)
        }

        entry.requests[requestId] = {
            sessionId: ssmConnectionInfo.sessionId,
            token: ssmConnectionInfo.token,
            url: ssmConnectionInfo.url,
            status: ssmConnectionInfo.status ?? 'fresh',
        }

        await writeMapping(mapping)
    }
}
