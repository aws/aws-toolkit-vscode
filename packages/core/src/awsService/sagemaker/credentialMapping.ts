/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as os from 'os'
import { fs } from '../../shared/fs/fs'
import globals from '../../shared/extensionGlobals'
import { ToolkitError } from '../../shared/errors'
import { DevSettings } from '../../shared/settings'
import { Auth } from '../../auth/auth'
import { SpaceMappings, SsmConnectionInfo } from './types'
import { getLogger } from '../../shared/logger/logger'
import { parseArn } from './detached-server/utils'

const mappingFileName = '.sagemaker-space-profiles'
const mappingFilePath = path.join(os.homedir(), '.aws', mappingFileName)

export async function loadMappings(): Promise<SpaceMappings> {
    try {
        if (!(await fs.existsFile(mappingFilePath))) {
            return {}
        }

        const raw = await fs.readFileText(mappingFilePath)
        return raw ? JSON.parse(raw) : {}
    } catch (error) {
        getLogger().error(`Failed to load space mappings from ${mappingFilePath}:`, error)
        return {}
    }
}

export async function saveMappings(data: SpaceMappings): Promise<void> {
    try {
        await fs.writeFile(mappingFilePath, JSON.stringify(data, undefined, 2), {
            mode: 0o600,
            atomic: true,
        })
    } catch (error) {
        getLogger().error(`Failed to save space mappings to ${mappingFilePath}:`, error)
    }
}

/**
 * Persists the current profile to the appropriate space mapping based on connection type and profile format.
 * @param appArn - The identifier for the SageMaker space.
 */
export async function persistLocalCredentials(appArn: string): Promise<void> {
    const currentProfileId = Auth.instance.getCurrentProfileId()
    if (!currentProfileId) {
        throw new ToolkitError('No current profile ID available for saving space credentials.')
    }

    if (currentProfileId.startsWith('sso:')) {
        const credentials = globals.loginManager.store.credentialsCache[currentProfileId]
        await setSpaceSsoProfile(
            appArn,
            credentials.credentials.accessKeyId,
            credentials.credentials.secretAccessKey,
            credentials.credentials.sessionToken ?? ''
        )
    } else {
        await setSpaceIamProfile(appArn, currentProfileId)
    }
}

/**
 * Persists deep link credentials for a SageMaker space using a derived refresh URL based on environment.
 *
 * @param appArn - ARN of the SageMaker space.
 * @param domain - The domain ID associated with the space.
 * @param session - SSM session ID.
 * @param wsUrl - SSM WebSocket URL.
 * @param token - Bearer token for the session.
 */
export async function persistSSMConnection(
    appArn: string,
    domain: string,
    session?: string,
    wsUrl?: string,
    token?: string
): Promise<void> {
    const { region } = parseArn(appArn)
    const endpoint = DevSettings.instance.get('endpoints', {})['sagemaker'] ?? ''

    // TODO: Hardcoded to 'jupyterlab' due to a bug in Studio that only supports refreshing
    // the token for both CodeEditor and JupyterLab Apps in the jupyterlab subdomain.
    // This will be fixed shortly after NYSummit launch to support refresh URL in CodeEditor subdomain.
    const appSubDomain = 'jupyterlab'

    let envSubdomain: string

    if (endpoint.includes('beta')) {
        envSubdomain = 'devo'
    } else if (endpoint.includes('gamma')) {
        envSubdomain = 'loadtest'
    } else {
        envSubdomain = 'studio'
    }

    // Use the standard AWS domain for 'studio' (prod).
    // For non-prod environments, use the obfuscated domain 'asfiovnxocqpcry.com'.
    const baseDomain =
        envSubdomain === 'studio'
            ? `studio.${region}.sagemaker.aws`
            : `${envSubdomain}.studio.${region}.asfiovnxocqpcry.com`

    const refreshUrl = `https://studio-${domain}.${baseDomain}/${appSubDomain}`
    await setSpaceCredentials(appArn, refreshUrl, {
        sessionId: session ?? '-',
        url: wsUrl ?? '-',
        token: token ?? '-',
    })
}

/**
 * Sets or updates an IAM credential profile for a given space.
 * @param spaceName - The name of the SageMaker space.
 * @param profileName - The local AWS profile name to associate.
 */
export async function setSpaceIamProfile(spaceName: string, profileName: string): Promise<void> {
    const data = await loadMappings()
    data.localCredential ??= {}
    data.localCredential[spaceName] = { type: 'iam', profileName }
    await saveMappings(data)
}

/**
 * Sets or updates an SSO credential profile for a given space.
 * @param spaceName - The name of the SageMaker space.
 * @param accessKey - Temporary access key from SSO.
 * @param secret - Temporary secret key from SSO.
 * @param token - Session token from SSO.
 */
export async function setSpaceSsoProfile(
    spaceName: string,
    accessKey: string,
    secret: string,
    token: string
): Promise<void> {
    const data = await loadMappings()
    data.localCredential ??= {}
    data.localCredential[spaceName] = { type: 'sso', accessKey, secret, token }
    await saveMappings(data)
}

/**
 * Stores SSM connection information for a given space, typically from a deep link session.
 * This initializes the request as 'fresh' and includes a refresh URL if provided.
 * @param spaceName - The name of the SageMaker space.
 * @param refreshUrl - URL to use for refreshing session tokens.
 * @param credentials - The session information used to initiate the connection.
 */
export async function setSpaceCredentials(
    spaceName: string,
    refreshUrl: string,
    credentials: SsmConnectionInfo
): Promise<void> {
    const data = await loadMappings()
    data.deepLink ??= {}

    data.deepLink[spaceName] = {
        refreshUrl,
        requests: {
            'initial-connection': {
                ...credentials,
                status: 'fresh',
            },
        },
    }

    await saveMappings(data)
}
