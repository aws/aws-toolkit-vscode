/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs'
import os from 'os'
import { join } from 'path'

export interface HyperpodSpaceMapping {
    namespace: string
    clusterArn: string
    clusterName: string
    eksClusterName: string
    endpoint?: string
    certificateAuthorityData?: string
}

export interface HyperpodMappings {
    [devspaceName: string]: HyperpodSpaceMapping
}

export const hyperpodMappingFilePath = join(os.homedir(), '.aws', '.hyperpod-space-profiles')
const tempFilePath = `${hyperpodMappingFilePath}.tmp`

let isWriting = false
const writeQueue: Array<() => Promise<void>> = []

/**
 * Reads the HyperPod mapping file
 */
export async function readHyperpodMapping(): Promise<HyperpodMappings> {
    try {
        const content = await fs.readFile(hyperpodMappingFilePath, 'utf-8')
        return JSON.parse(content)
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            return {} // Return empty mapping if file doesn't exist
        }
        throw new Error(`Failed to read HyperPod mapping file: ${err.message}`)
    }
}

/**
 * Writes the HyperPod mapping to file atomically
 */
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
        void processWriteQueue()
    })
}

/**
 * Stores HyperPod space connection info
 */
export async function storeHyperpodConnection(
    devspaceName: string,
    namespace: string,
    clusterArn: string,
    clusterName: string,
    eksClusterName: string,
    endpoint?: string,
    certificateAuthorityData?: string
): Promise<void> {
    const mapping = await readHyperpodMapping()
    mapping[devspaceName] = {
        namespace,
        clusterArn,
        clusterName,
        eksClusterName,
        endpoint,
        certificateAuthorityData,
    }
    await writeHyperpodMapping(mapping)
}

/**
 * Gets all stored HyperPod connections
 */
export async function getStoredConnections(): Promise<HyperpodMappings> {
    return await readHyperpodMapping()
}

/**
 * Gets HyperPod space connection info
 */
export async function getHyperpodConnection(devspaceName: string): Promise<HyperpodSpaceMapping | undefined> {
    const mapping = await readHyperpodMapping()
    return mapping[devspaceName]
}

async function processWriteQueue() {
    if (isWriting || writeQueue.length === 0) {
        return
    }

    isWriting = true
    try {
        while (writeQueue.length > 0) {
            const writeOperation = writeQueue.shift()!
            await writeOperation()
        }
    } finally {
        isWriting = false
    }
}
