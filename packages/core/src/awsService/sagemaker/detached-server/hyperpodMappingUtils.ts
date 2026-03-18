/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs' // eslint-disable-line no-restricted-imports
import os from 'os'
import { join } from 'path'

import { WriteQueue } from './writeQueue'

export interface HyperpodSpaceMapping {
    namespace: string
    clusterArn: string
    clusterName: string
    endpoint?: string
    certificateAuthorityData?: string
    region?: string
    accountId?: string
    wsUrl?: string
    token?: string
}

export interface HyperpodMappings {
    [connectionKey: string]: HyperpodSpaceMapping
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

export async function storeHyperpodConnection(
    workspaceName: string,
    namespace: string,
    clusterArn: string,
    clusterName: string,
    endpoint?: string,
    certificateAuthorityData?: string,
    region?: string,
    wsUrl?: string,
    token?: string
): Promise<void> {
    const mapping = await readHyperpodMapping()
    const connectionKey = createConnectionKey(workspaceName, namespace, clusterName)
    const accountId = clusterArn.split(':')[4]
    mapping[connectionKey] = {
        namespace,
        clusterArn,
        clusterName,
        endpoint,
        certificateAuthorityData,
        region,
        accountId,
        wsUrl,
        token,
    }
    await writeHyperpodMapping(mapping)
}

export async function getStoredConnections(): Promise<HyperpodMappings> {
    return await readHyperpodMapping()
}

export async function getHyperpodConnection(connectionKey: string): Promise<HyperpodSpaceMapping | undefined> {
    const mapping = await readHyperpodMapping()
    return mapping[connectionKey]
}

export async function getHyperpodConnectionByDetails(
    workspaceName: string,
    namespace: string,
    clusterName: string
): Promise<HyperpodSpaceMapping | undefined> {
    const connectionKey = createConnectionKey(workspaceName, namespace, clusterName)
    return getHyperpodConnection(connectionKey)
}
