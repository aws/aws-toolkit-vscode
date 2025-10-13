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
import { SagemakerUnifiedStudioSpaceNode } from '../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioSpaceNode'
import { SageMakerUnifiedStudioSpacesParentNode } from '../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioSpacesParentNode'

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
 * @param spaceArn - The arn for the SageMaker space.
 */
export async function persistLocalCredentials(spaceArn: string): Promise<void> {
    const currentProfileId = Auth.instance.getCurrentProfileId()
    if (!currentProfileId) {
        throw new ToolkitError('No current profile ID available for saving space credentials.')
    }

    if (currentProfileId.startsWith('sso:')) {
        const credentials = globals.loginManager.store.credentialsCache[currentProfileId]
        await setSpaceSsoProfile(
            spaceArn,
            credentials.credentials.accessKeyId,
            credentials.credentials.secretAccessKey,
            credentials.credentials.sessionToken ?? ''
        )
    } else {
        await setSpaceIamProfile(spaceArn, currentProfileId)
    }
}

/**
 * Persists the current selected SMUS Project Role creds to the appropriate space mapping.
 * @param spaceArn - The identifier for the SageMaker Space.
 */
export async function persistSmusProjectCreds(spaceArn: string, node: SagemakerUnifiedStudioSpaceNode): Promise<void> {
    const nodeParent = node.getParent() as SageMakerUnifiedStudioSpacesParentNode
    const authProvider = nodeParent.getAuthProvider()
    const projectId = nodeParent.getProjectId()
    const projectAuthProvider = await authProvider.getProjectCredentialProvider(projectId)
    await projectAuthProvider.getCredentials()
    await setSmusSpaceSsoProfile(spaceArn, projectId)
    // Trigger SSH credential refresh for the project
    projectAuthProvider.startProactiveCredentialRefresh()
}

/**
 * Persists deep link credentials for a SageMaker space using a derived refresh URL based on environment.
 *
 * @param spaceArn - ARN of the SageMaker space.
 * @param domain - The domain ID associated with the space.
 * @param session - SSM session ID.
 * @param wsUrl - SSM WebSocket URL.
 * @param token - Bearer token for the session.
 */
export async function persistSSMConnection(
    spaceArn: string,
    domain: string,
    session?: string,
    wsUrl?: string,
    token?: string,
    appType?: string
): Promise<void> {
    const { region } = parseArn(spaceArn)
    const endpoint = DevSettings.instance.get('endpoints', {})['sagemaker'] ?? ''

    let appSubDomain = 'jupyterlab'
    if (appType && appType.toLowerCase() === 'codeeditor') {
        appSubDomain = 'code-editor'
    }

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
    await setSpaceCredentials(spaceArn, refreshUrl, {
        sessionId: session ?? '-',
        url: wsUrl ?? '-',
        token: token ?? '-',
    })
}

/**
 * Sets or updates an IAM credential profile for a given space.
 * @param spaceArn - The name of the SageMaker space.
 * @param profileName - The local AWS profile name to associate.
 */
export async function setSpaceIamProfile(spaceArn: string, profileName: string): Promise<void> {
    const data = await loadMappings()
    data.localCredential ??= {}
    data.localCredential[spaceArn] = { type: 'iam', profileName }
    await saveMappings(data)
}

/**
 * Sets or updates an SSO credential profile for a given space.
 * @param spaceArn - The arn of the SageMaker space.
 * @param accessKey - Temporary access key from SSO.
 * @param secret - Temporary secret key from SSO.
 * @param token - Session token from SSO.
 */
export async function setSpaceSsoProfile(
    spaceArn: string,
    accessKey: string,
    secret: string,
    token: string
): Promise<void> {
    const data = await loadMappings()
    data.localCredential ??= {}
    data.localCredential[spaceArn] = { type: 'sso', accessKey, secret, token }
    await saveMappings(data)
}

/**
 * Sets the SM Space to map to SageMaker Unified Studio Project.
 * @param spaceArn - The arn of the SageMaker Unified Studio space.
 * @param projectId - The project ID associated with the SageMaker Unified Studio space.
 */
export async function setSmusSpaceSsoProfile(spaceArn: string, projectId: string): Promise<void> {
    const data = await loadMappings()
    data.localCredential ??= {}
    data.localCredential[spaceArn] = { type: 'sso', smusProjectId: projectId }
    await saveMappings(data)
}

/**
 * Stores SSM connection information for a given space, typically from a deep link session.
 * This initializes the request as 'fresh' and includes a refresh URL if provided.
 * @param spaceArn - The arn of the SageMaker space.
 * @param refreshUrl - URL to use for refreshing session tokens.
 * @param credentials - The session information used to initiate the connection.
 */
export async function setSpaceCredentials(
    spaceArn: string,
    refreshUrl: string,
    credentials: SsmConnectionInfo
): Promise<void> {
    const data = await loadMappings()
    data.deepLink ??= {}

    data.deepLink[spaceArn] = {
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
