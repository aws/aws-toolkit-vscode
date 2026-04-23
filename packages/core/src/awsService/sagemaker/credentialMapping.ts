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
import { getCredentialsFromStore } from '../../auth/credentials/store'
import { CredentialsId, fromString } from '../../auth/providers/credentials'
import { getLogger } from '../../shared/logger/logger'
import { parseArn } from './utils'
import { SagemakerUnifiedStudioSpaceNode } from '../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioSpaceNode'
import { SageMakerUnifiedStudioSpacesParentNode } from '../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioSpacesParentNode'
import { isSmusSsoConnection } from '../../sagemakerunifiedstudio/auth/model'

const mappingFileName = '.sagemaker-space-profiles'
const mappingFilePath = path.join(os.homedir(), '.aws', mappingFileName)

export interface SsoCachedCredentials {
    credentials: {
        accessKeyId: string
        secretAccessKey: string
        sessionToken?: string
        expiration?: Date
    }
}

/**
 * Proactive credential refresh for SSO-based SageMaker Space connections.
 *
 * Follows the same pattern as SMUS `ProjectRoleCredentialsProvider.startProactiveCredentialRefresh()`:
 * - Checks every 10 seconds using setTimeout (handles sleep/resume correctly)
 * - Refreshes when credentials expire within 5 minutes (safety buffer)
 * - Writes fresh credentials to the mapping file so the detached server always reads valid creds
 *
 * Without this, SSO connections disconnect after ~1 hour when the initial STS credentials expire
 * because `persistLocalCredentials()` only writes once at connection time.
 */
export class SsoCredentialRefresher {
    private refreshTimer?: ReturnType<typeof setTimeout>
    private active = false
    readonly checkIntervalMs: number
    readonly safetyBufferMs: number

    constructor(
        private readonly spaceArn: string,
        private readonly getCachedCredentials: () => SsoCachedCredentials | undefined,
        private readonly credentialsId: CredentialsId,
        options?: { checkIntervalMs?: number; safetyBufferMs?: number }
    ) {
        this.checkIntervalMs = options?.checkIntervalMs ?? 60_000
        this.safetyBufferMs = options?.safetyBufferMs ?? 5 * 60_000
    }

    public start(): void {
        if (this.active) {
            getLogger().debug(`SSO refresh [${this.spaceArn}]: already active, skipping start`)
            return
        }
        this.active = true
        getLogger().info(`SSO refresh [${this.spaceArn}]: started (check every ${this.checkIntervalMs / 1000}s, buffer ${this.safetyBufferMs / 60000} min)`)
        this.scheduleNextCheck()
    }

    public stop(): void {
        this.active = false
        if (this.refreshTimer !== undefined) {
            clearTimeout(this.refreshTimer)
            this.refreshTimer = undefined
        }
        getLogger().info(`SSO refresh [${this.spaceArn}]: stopped`)
    }

    public isActive(): boolean {
        return this.active
    }

    private scheduleNextCheck(): void {
        if (!this.active) {
            return
        }
        this.refreshTimer = setTimeout(async () => {
            try {
                await this.refreshIfNeeded()
            } catch (error) {
                getLogger().error(`SSO credential refresh failed for ${this.spaceArn}: %O`, error)
            }
            if (this.active) {
                this.scheduleNextCheck()
            }
        }, this.checkIntervalMs)
    }

    private async refreshIfNeeded(): Promise<void> {
        const cached = this.getCachedCredentials()
        const expiration = cached?.credentials.expiration?.getTime()
        const now = Date.now()
        const minutesLeft = expiration ? Math.round((expiration - now) / 60000) : 'unknown'

        getLogger().debug(`SSO refresh check [${this.spaceArn}]: expiry in ${minutesLeft} min, buffer=${this.safetyBufferMs / 60000} min`)

        if (expiration && expiration - now > this.safetyBufferMs) {
            return // still fresh
        }

        getLogger().info(`SSO refresh [${this.spaceArn}]: credentials expiring soon (${minutesLeft} min left), fetching fresh via GetRoleCredentials`)

        try {
            const freshCreds = await getCredentialsFromStore(this.credentialsId, globals.loginManager.store)
            if (!freshCreds) {
                getLogger().warn(`SSO refresh [${this.spaceArn}]: getCredentialsFromStore returned undefined - bearer token may be expired`)
                return
            }

            getLogger().debug(`SSO refresh [${this.spaceArn}]: got fresh creds, expiry=${freshCreds.expiration?.toISOString()}`)

            await setSpaceSsoProfile(
                this.spaceArn,
                freshCreds.accessKeyId,
                freshCreds.secretAccessKey,
                freshCreds.sessionToken ?? ''
            )

            getLogger().info(`SSO refresh [${this.spaceArn}]: mapping file updated with fresh credentials`)
        } catch (error) {
            getLogger().error(`SSO refresh [${this.spaceArn}]: failed to refresh: %O`, error)
        }
    }
}

/** Active SSO credential refreshers, keyed by spaceArn */
const activeSsoRefreshers = new Map<string, SsoCredentialRefresher>()

/**
 * Stops all active SSO credential refreshers. Call on extension deactivation or user logout.
 */
export function stopAllSsoCredentialRefreshers(): void {
    for (const refresher of activeSsoRefreshers.values()) {
        refresher.stop()
    }
    activeSsoRefreshers.clear()
}

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
    getLogger().info(`SageMaker persistLocalCredentials: called for space ${spaceArn}, profileId=${currentProfileId}`)
    if (!currentProfileId) {
        throw new ToolkitError('No current profile ID available for saving space credentials.')
    }

    if (currentProfileId.startsWith('sso:')) {
        const credentials = globals.loginManager.store.credentialsCache[currentProfileId]
        getLogger().debug('SageMaker persistLocalCredentials: writing SSO credentials to mapping file')
        await setSpaceSsoProfile(
            spaceArn,
            credentials.credentials.accessKeyId,
            credentials.credentials.secretAccessKey,
            credentials.credentials.sessionToken ?? ''
        )

        // Start proactive credential refresh for SSO connections.
        // Without this, the mapping file goes stale after ~1h (default STS TTL)
        // and the detached server reads expired credentials on reconnect.
        const existing = activeSsoRefreshers.get(spaceArn)
        if (existing) {
            existing.stop()
        }
        const refresher = new SsoCredentialRefresher(spaceArn, () => {
            return globals.loginManager.store.credentialsCache[currentProfileId] as SsoCachedCredentials | undefined
        }, fromString(currentProfileId))
        activeSsoRefreshers.set(spaceArn, refresher)
        refresher.start()
        getLogger().info(`SageMaker persistLocalCredentials: SSO credential refresher started for ${spaceArn}`)
    } else {
        getLogger().debug(`SageMaker persistLocalCredentials: IAM profile ${currentProfileId}, no refresher needed`)
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
    const activeConnection = authProvider.activeConnection
    const projectId = nodeParent.getProjectId()
    const projectAuthProvider = await authProvider.getProjectCredentialProvider(projectId)
    await projectAuthProvider.getCredentials()
    await setSmusSpaceProfile(spaceArn, projectId, isSmusSsoConnection(activeConnection) ? 'sso' : 'iam')
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
 * @param appType - Application type (e.g., 'jupyterlab', 'codeeditor').
 * @param isSMUS - If true, skip refreshUrl construction (SMUS connections cannot refresh).
 */
export async function persistSSMConnection(
    spaceArn: string,
    domain: string,
    session?: string,
    wsUrl?: string,
    token?: string,
    appType?: string,
    isSMUS?: boolean
): Promise<void> {
    let refreshUrl: string | undefined

    if (!isSMUS) {
        // Construct refreshUrl for SageMaker AI connections
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

        refreshUrl = `https://studio-${domain}.${baseDomain}/${appSubDomain}`
    }
    // For SMUS connections, refreshUrl remains undefined

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
 * @param credentialType - The type of credential ('sso' or 'iam').
 */
export async function setSmusSpaceProfile(
    spaceArn: string,
    projectId: string,
    credentialType: 'iam' | 'sso'
): Promise<void> {
    const data = await loadMappings()
    data.localCredential ??= {}
    data.localCredential[spaceArn] = { type: credentialType, smusProjectId: projectId }
    await saveMappings(data)
}

/**
 * Stores SSM connection information for a given space, typically from a deep link session.
 * This initializes the request as 'fresh' and includes a refresh URL if provided.
 * @param spaceArn - The arn of the SageMaker space.
 * @param refreshUrl - URL to use for refreshing session tokens (undefined for SMUS connections).
 * @param credentials - The session information used to initiate the connection.
 */
export async function setSpaceCredentials(
    spaceArn: string,
    refreshUrl: string | undefined,
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
