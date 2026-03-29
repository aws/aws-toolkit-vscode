/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Disabled: detached server files cannot import vscode.
/* eslint-disable aws-toolkits/no-console-log */
/* eslint-disable no-restricted-imports */
import { ServerInfo } from '../types'
import { promises as fs } from 'fs'
import { SageMakerClient, StartSessionCommand } from '@amzn/sagemaker-client'
import os from 'os'
import { join } from 'path'
import { SpaceMappings } from '../types'
import open from 'open'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'
import { WriteQueue } from './writeQueue'
export { open }

export const mappingFilePath = join(os.homedir(), '.aws', '.sagemaker-space-profiles')
const tempFilePath = `${mappingFilePath}.tmp`

const writeQueue = new WriteQueue()

// Currently SSM registration happens asynchronously with App launch, which can lead to
// StartSession Internal Failure when connecting to a fresly-started Space.
// To mitigate, spread out retries over multiple seconds instead of sending all retries within a second.
// Backoff sequence: 1500ms, 2250ms, 3375ms
// Retry timing: 1500ms, 3750ms, 7125ms
const startSessionRetryStrategy = new ConfiguredRetryStrategy(3, (attempt: number) => 1000 * 1.5 ** attempt)

/**
 * Reads the local endpoint info file (default or via env) and returns pid & port.
 * @throws Error if the file is missing, invalid JSON, or missing fields
 */
export async function readServerInfo(): Promise<ServerInfo> {
    const filePath = process.env.SAGEMAKER_LOCAL_SERVER_FILE_PATH
    if (!filePath) {
        throw new Error('Environment variable SAGEMAKER_LOCAL_SERVER_FILE_PATH is not set')
    }

    try {
        const content = await fs.readFile(filePath, 'utf-8')
        const data = JSON.parse(content)
        if (typeof data.pid !== 'number' || typeof data.port !== 'number') {
            throw new TypeError(`Invalid server info format in ${filePath}`)
        }
        return { pid: data.pid, port: data.port }
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            throw new Error(`Server info file not found at ${filePath}`)
        }
        throw new Error(`Failed to read server info: ${err.message ?? String(err)}`)
    }
}

export function parseArn(arn: string): { region: string; accountId: string; resourceName: string } {
    const cleanedArn = arn.includes('@') ? arn.split('@')[1] : arn
    const regex = /^arn:aws:[^:]+:(?<region>[^:]+):(?<account_id>\d+):(space|cluster)[/:].+$/i
    const match = cleanedArn.match(regex)

    if (!match?.groups) {
        throw new Error(`Invalid ARN format: "${arn}"`)
    }

    const resourceName = cleanedArn.split('/').pop()
    if (!resourceName) {
        throw new Error(`Could not extract resource name from ARN: "${arn}"`)
    }

    return {
        region: match.groups.region,
        accountId: match.groups.account_id,
        resourceName,
    }
}

export async function startSagemakerSession({ region, connectionIdentifier, credentials }: any) {
    const endpoint = process.env.SAGEMAKER_ENDPOINT || `https://sagemaker.${region}.amazonaws.com`
    const client = new SageMakerClient({ region, credentials, endpoint, retryStrategy: startSessionRetryStrategy })
    const command = new StartSessionCommand({ ResourceIdentifier: connectionIdentifier })
    return client.send(command)
}

/**
 * Reads the mapping file and parses it as JSON.
 * Throws if the file doesn't exist or is malformed.
 */
export async function readMapping() {
    try {
        const content = await fs.readFile(mappingFilePath, 'utf-8')
        console.log(`Mapping file path: ${mappingFilePath}`)
        return JSON.parse(content)
    } catch (err) {
        throw new Error(`Failed to read mapping file: ${err instanceof Error ? err.message : String(err)}`)
    }
}

/**
 * Detects if the connection identifier is using SMUS credentials
 * @param connectionIdentifier - The connection identifier to check
 * @returns Promise<boolean> - true if SMUS, false otherwise
 */
export async function isSmusConnection(connectionIdentifier: string): Promise<boolean> {
    try {
        const mapping = await readMapping()
        const profile = mapping.localCredential?.[connectionIdentifier]

        // Check if profile exists and has smusProjectId
        return profile && 'smusProjectId' in profile
    } catch (err) {
        // If we can't read the mapping, assume not SMUS to avoid breaking existing functionality
        return false
    }
}

/**
 * Detects if the connection identifier is using SMUS IAM credentials
 * @param connectionIdentifier - The connection identifier to check
 * @returns Promise<boolean> - true if SMUS IAM connection, false otherwise
 */
export async function isSmusIamConnection(connectionIdentifier: string): Promise<boolean> {
    try {
        const mapping = await readMapping()
        const profile = mapping.localCredential?.[connectionIdentifier]

        // Check if profile exists, has smusProjectId, and type is 'iam'
        return profile && 'smusProjectId' in profile && profile.type === 'iam'
    } catch (err) {
        // If we can't detect it is iam connection, assume not SMUS IAM to avoid breaking existing functionality
        return false
    }
}

/**
 * Writes the mapping to a temp file and atomically renames it to the target path.
 * Uses a queue to prevent race conditions when multiple requests try to write simultaneously.
 */
export async function writeMapping(mapping: SpaceMappings) {
    return new Promise<void>((resolve, reject) => {
        const writeOperation = async () => {
            try {
                // Generate unique temp file name to avoid conflicts
                const uniqueTempPath = `${tempFilePath}.${process.pid}.${Date.now()}`

                const json = JSON.stringify(mapping, undefined, 2)
                await fs.writeFile(uniqueTempPath, json)
                await fs.rename(uniqueTempPath, mappingFilePath)
                resolve()
            } catch (err) {
                reject(new Error(`Failed to write mapping file: ${err instanceof Error ? err.message : String(err)}`))
            }
        }

        writeQueue.push(writeOperation)

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        writeQueue.process()
    })
}
