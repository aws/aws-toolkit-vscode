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
export { open }

export const mappingFilePath = join(os.homedir(), '.aws', '.sagemaker-space-profiles')
const tempFilePath = `${mappingFilePath}.tmp`

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

/**
 * Parses a SageMaker ARN to extract region, account ID, and space name.
 * Supports formats like:
 *   arn:aws:sagemaker:<region>:<account_id>:space/<domain>/<space_name>
 *   or sm_lc_arn:aws:sagemaker:<region>:<account_id>:space__d-xxxx__<name>
 *
 * If the input is prefixed with an identifier (e.g. "sagemaker-user@"), the function will strip it.
 *
 * @param arn - The full SageMaker ARN string
 * @returns An object containing the region, accountId, and spaceName
 * @throws If the ARN format is invalid
 */
export function parseArn(arn: string): { region: string; accountId: string; spaceName: string } {
    const cleanedArn = arn.includes('@') ? arn.split('@')[1] : arn
    const regex = /^arn:aws:sagemaker:(?<region>[^:]+):(?<account_id>\d+):space[/:].+$/i
    const match = cleanedArn.match(regex)

    if (!match?.groups) {
        throw new Error(`Invalid SageMaker ARN format: "${arn}"`)
    }

    // Extract space name from the end of the ARN (after the last forward slash)
    const spaceName = cleanedArn.split('/').pop()
    if (!spaceName) {
        throw new Error(`Could not extract space name from ARN: "${arn}"`)
    }

    return {
        region: match.groups.region,
        accountId: match.groups.account_id,
        spaceName: spaceName,
    }
}

export async function startSagemakerSession({ region, connectionIdentifier, credentials }: any) {
    const endpoint = process.env.SAGEMAKER_ENDPOINT || `https://sagemaker.${region}.amazonaws.com`
    const client = new SageMakerClient({ region, credentials, endpoint })
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
        console.log(`Conents: ${content}`)
        return JSON.parse(content)
    } catch (err) {
        throw new Error(`Failed to read mapping file: ${err instanceof Error ? err.message : String(err)}`)
    }
}

/**
 * Writes the mapping to a temp file and atomically renames it to the target path.
 */
export async function writeMapping(mapping: SpaceMappings) {
    try {
        const json = JSON.stringify(mapping, undefined, 2)
        await fs.writeFile(tempFilePath, json)
        await fs.rename(tempFilePath, mappingFilePath)
    } catch (err) {
        throw new Error(`Failed to write mapping file: ${err instanceof Error ? err.message : String(err)}`)
    }
}
