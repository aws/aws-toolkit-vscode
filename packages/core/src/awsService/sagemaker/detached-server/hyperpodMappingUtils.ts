/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs' // eslint-disable-line no-restricted-imports
import os from 'os'
import { join } from 'path'

import { WriteQueue } from './writeQueue'
import { SsmConnectionInfo } from '../types'

export interface HyperpodLocalCredential {
    namespace: string
    clusterArn: string
    clusterName: string
    endpoint?: string
    certificateAuthorityData?: string
    region?: string
    accountId?: string
    eksClusterName?: string
    /** Console URL for browser-based reconnection (mirrors StudioMFE pattern). */
    refreshUrl?: string
    credentials?: {
        accessKeyId: string
        secretAccessKey: string
        sessionToken?: string
    }
}

export interface HyperpodDeepLinkEntry {
    requests: {
        [requestId: string]: SsmConnectionInfo & { status?: 'fresh' | 'consumed' | 'pending' }
    }
}

export interface HyperpodMappings {
    localCredential?: {
        [connectionKey: string]: HyperpodLocalCredential
    }
    deepLink?: {
        [connectionKey: string]: HyperpodDeepLinkEntry
    }
}

export const hyperpodMappingFilePath = join(os.homedir(), '.aws', '.hyperpod-space-profiles')
const tempFilePath = `${hyperpodMappingFilePath}.tmp`

const writeQueue = new WriteQueue()

export async function readHyperpodMapping(): Promise<HyperpodMappings> {
    try {
        const content = await fs.readFile(hyperpodMappingFilePath, 'utf-8')
        return JSON.parse(content)
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            return {}
        }
        throw new Error(`Failed to read HyperPod mapping file: ${err.message}`)
    }
}

export async function writeHyperpodMapping(mapping: HyperpodMappings): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const writeOperation = async () => {
            try {
                const uniqueTempPath = `${tempFilePath}.${process.pid}.${Date.now()}`
                const json = JSON.stringify(mapping, undefined, 2)
                await fs.writeFile(uniqueTempPath, json)
                await fs.rename(uniqueTempPath, hyperpodMappingFilePath)
                resolve()
            } catch (err: any) {
                reject(new Error(`Failed to write HyperPod mapping file: ${err.message}`))
            }
        }

        writeQueue.push(writeOperation)
        void writeQueue.process()
    })
}

export function createConnectionKey(workspaceName: string, namespace: string, clusterName: string): string {
    if (workspaceName.includes(':') || namespace.includes(':') || clusterName.includes(':')) {
        throw new Error('Connection key parameters cannot contain colon characters')
    }
    return `${workspaceName}:${namespace}:${clusterName}`
}

export async function getHyperpodFreshEntry(connectionKey: string, requestId: string = 'initial-connection') {
    const mapping = await readHyperpodMapping()
    const entry = mapping.deepLink?.[connectionKey]
    if (!entry?.requests) {
        return undefined
    }

    // Check initial-connection first (from deeplink store), then requestId
    const initialReq = entry.requests['initial-connection']
    if (initialReq?.status === 'fresh') {
        await markHyperpodConsumed(connectionKey, 'initial-connection')
        return initialReq
    }

    if (requestId !== 'initial-connection') {
        const req = entry.requests[requestId]
        if (req?.status === 'fresh') {
            await markHyperpodConsumed(connectionKey, requestId)
            return req
        }
    }

    return undefined
}

export async function markHyperpodConsumed(connectionKey: string, requestId: string = 'initial-connection') {
    const mapping = await readHyperpodMapping()
    const entry = mapping.deepLink?.[connectionKey]
    if (!entry?.requests?.[requestId]) {
        return
    }
    entry.requests[requestId].status = 'consumed'
    await writeHyperpodMapping(mapping)
}

export async function getHyperpodRequestStatus(
    connectionKey: string,
    requestId: string = 'initial-connection'
): Promise<'fresh' | 'consumed' | 'pending' | 'not-started'> {
    const mapping = await readHyperpodMapping()
    const entry = mapping.deepLink?.[connectionKey]
    return entry?.requests?.[requestId]?.status ?? 'not-started'
}
