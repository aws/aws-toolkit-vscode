/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../shared/extensionGlobals'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { AwsContext } from '../../shared/awsContext'
import { getLogger } from '../../shared/logger'
import { CredentialSourceId, CredentialType, Result } from '../../shared/telemetry/telemetry'
import { CredentialsStore } from '../credentials/store'
import { CredentialsSettings, showLoginFailedMessage } from '../credentials/utils'
import {
    asString,
    CredentialsProvider,
    CredentialsId,
    credentialsProviderToTelemetryType,
    fromString,
} from '../providers/credentials'
import { CredentialsProviderManager } from '../providers/credentialsProviderManager'
import { getIdeProperties, isCloud9 } from '../../shared/extensionUtilities'
import { SharedCredentialsProvider } from '../providers/sharedCredentialsProvider'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { isAutomation } from '../../shared/vscode/env'
import { Credentials } from '@aws-sdk/types'
import { ToolkitError } from '../../shared/errors'
import * as localizedText from '../../shared/localizedText'
import { DefaultStsClient } from '../../shared/clients/stsClient'
import { findAsync } from '../../shared/utilities/collectionUtils'
import { telemetry } from '../../shared/telemetry/telemetry'

/**
 * @deprecated Replaced by `Auth` in `src/credentials/auth.ts`
 */
export class LoginManager {
    private readonly defaultCredentialsRegion = 'us-east-1'

    public constructor(
        private readonly awsContext: AwsContext,
        public readonly store: CredentialsStore,
        public readonly recordAwsValidateCredentialsFn = telemetry.aws_validateCredentials.emit.bind(
            telemetry.aws_validateCredentials
        )
    ) {}

    /**
     * Establishes a Credentials for the Toolkit to use. Essentially the Toolkit becomes "logged in".
     * If an error occurs while trying to set up and verify these credentials, the Toolkit is "logged out".
     *
     * @param passive  If true, this was _not_ a user-initiated action.
     * @param provider  Credentials provider id
     * @returns True if the toolkit could connect with the providerId
     */

    public async login(args: { passive: boolean; providerId: CredentialsId }): Promise<boolean> {
        let provider: CredentialsProvider | undefined
        let telemetryResult: Result = 'Failed'

        try {
            provider = await getProvider(args.providerId)

            const credentials = (await this.store.upsertCredentials(args.providerId, provider))?.credentials
            if (!credentials) {
                throw new Error(`No credentials found for id ${asString(args.providerId)}`)
            }

            const accountId = await this.validateCredentials(credentials, provider.getDefaultRegion())
            this.awsContext.credentialsShim = createCredentialsShim(this.store, args.providerId, credentials)
            await this.awsContext.setCredentials({
                credentials,
                accountId: accountId,
                credentialsId: asString(args.providerId),
                defaultRegion: provider.getDefaultRegion(),
            })

            telemetryResult = 'Succeeded'
            return true
        } catch (err) {
            const credentialsId = asString(args.providerId)
            if (!CancellationError.isUserCancelled(err)) {
                const errMsg = (err as Error).message
                const msg = `login: failed to connect with "${credentialsId}": ${errMsg}`
                if (!args.passive) {
                    showLoginFailedMessage(credentialsId, errMsg)
                    getLogger().error(msg)
                }
            } else {
                getLogger().info(`login: cancelled credentials request from "${credentialsId}"`)
            }

            await this.logout()
            this.store.invalidateCredentials(args.providerId)
            this.awsContext.credentialsShim = undefined
            return false
        } finally {
            const credType = provider?.getTelemetryType()
            const sourceType = provider ? credentialsProviderToTelemetryType(provider.getProviderType()) : undefined
            this.recordAwsValidateCredentialsFn({
                result: telemetryResult,
                passive: args.passive,
                credentialType: credType,
                credentialSourceId: sourceType,
            })
        }
    }

    public async validateCredentials(credentials: Credentials, region = this.defaultCredentialsRegion) {
        const stsClient = new DefaultStsClient(region, credentials)
        const accountId = (await stsClient.getCallerIdentity()).Account
        if (!accountId) {
            throw new Error('Could not determine Account Id for credentials')
        }

        return accountId
    }

    /**
     * Removes Credentials from the Toolkit. Essentially the Toolkit becomes "logged out".
     *
     * TODO: for SSO this should do a server-side logout.
     */
    public async logout(force?: boolean): Promise<void> {
        await this.awsContext.setCredentials(undefined, force)
        this.awsContext.credentialsShim = undefined
    }

    private static didTryAutoConnect = false

    public static async tryAutoConnect(awsContext: AwsContext = globals.awsContext): Promise<boolean> {
        if (isAutomation()) {
            return false
        }
        if (await awsContext.getCredentials()) {
            return true // Already connected.
        }
        if (LoginManager.didTryAutoConnect) {
            return false
        }
        LoginManager.didTryAutoConnect = true
        try {
            getLogger().debug('credentials: attempting autoconnect...')
            const loginManager = new LoginManager(awsContext, new CredentialsStore())
            await loginWithMostRecentCredentials(new CredentialsSettings(), loginManager)
        } catch (err) {
            getLogger().error('credentials: failed to auto-connect: %s', err)
            void showViewLogsMessage(
                localize('AWS.credentials.autoconnect.fatal', 'Exception occurred while connecting')
            )
        }
        return !!(await awsContext.getCredentials())
    }
}

/**
 * Auto-connects with the last-used credentials, else the "default" profile,
 * else randomly tries the first three profiles (for Cloud9, ECS, or other
 * container-like environments).
 */
export async function loginWithMostRecentCredentials(
    settings: CredentialsSettings,
    loginManager: LoginManager
): Promise<void> {
    const defaultName = 'profile:default'
    const manager = CredentialsProviderManager.getInstance()
    const previousCredentialsId = settings.get('profile', '')

    async function tryConnect(creds: CredentialsId, popup: boolean): Promise<boolean> {
        const provider = await manager.getCredentialsProvider(creds)
        // 'provider' may be undefined if the last-used credentials no longer exists.
        if (!provider) {
            getLogger().warn('autoconnect: getCredentialsProvider() lookup failed for profile: %O', asString(creds))
        } else if (await provider.canAutoConnect()) {
            if (!(await loginManager.login({ passive: true, providerId: creds }))) {
                getLogger().warn('autoconnect: failed to connect: "%s"', asString(creds))
                return false
            }
            getLogger().info('autoconnect: connected: %O', asString(creds))
            if (popup) {
                await vscode.window.showInformationMessage(
                    localize(
                        'AWS.message.credentials.connected',
                        'Connected to {0} with {1}',
                        getIdeProperties().company,
                        asString(creds)
                    )
                )
            }
            return true
        }
        return false
    }

    // Auto-connect if there is a recently-used profile.
    if (previousCredentialsId) {
        // Migrate from old Toolkits: default to "shared" provider type.
        const loginCredentialsId = tryMakeCredentialsProviderId(previousCredentialsId) ?? {
            credentialSource: SharedCredentialsProvider.getProviderType(),
            credentialTypeId: previousCredentialsId,
        }
        if (await tryConnect(loginCredentialsId, false)) {
            return
        }
        getLogger().warn('autoconnect: login failed: "%s"', previousCredentialsId)
    }

    const providerMap = await manager.getCredentialProviderNames()
    const profileNames = Object.keys(providerMap)
    // Look for "default" profile or exactly one (any name).
    const defaultProfile = profileNames.includes(defaultName)
        ? defaultName
        : profileNames.length === 1
        ? profileNames[0]
        : undefined

    if (!previousCredentialsId && profileNames.length === 0) {
        await loginManager.logout(true)
        getLogger().info('autoconnect: skipped (profileNames=%d)', profileNames.length)
        return
    }

    // Try to auto-connect the default profile.
    if (defaultProfile && defaultProfile !== previousCredentialsId) {
        getLogger().info('autoconnect: trying "%s"', defaultProfile)
        if (await tryConnect(providerMap[defaultProfile], !isCloud9())) {
            return
        }
    }

    // Try to auto-connect any other non-default profile (useful for env vars, IMDS, Cloud9, ECS, …).
    const nonDefault = await findAsync(profileNames, async p => {
        const provider = await manager.getCredentialsProvider(providerMap[p])
        return p !== defaultName && !!(await provider?.canAutoConnect())
    })
    if (nonDefault) {
        getLogger().info('autoconnect: trying "%s"', nonDefault)
        if (await tryConnect(providerMap[nonDefault], !isCloud9())) {
            return
        }
    }

    await loginManager.logout(true)
}

function tryMakeCredentialsProviderId(credentials: string): CredentialsId | undefined {
    try {
        return fromString(credentials)
    } catch (err) {
        return undefined
    }
}

async function getProvider(id: CredentialsId): Promise<CredentialsProvider> {
    const provider = await CredentialsProviderManager.getInstance().getCredentialsProvider(id)
    if (!provider) {
        throw new Error(`Could not find Credentials Provider for ${asString(id)}`)
    }
    return provider
}

/**
 * The Toolkit implementation has a good amount of custom logic (SSO, source profiles, etc.)
 * that was written to fill feature gaps in both AWS SDK V2 and V3. This code works imperfectly with
 * pre-existing SDK refresh logic, leading to users experiencing issues with credentials expiring and
 * forcing them to re-select a profile to refresh.
 *
 * So, this interface sits between everything else to mediate the refreshes. Adding a thin interface
 * is preferred over bulking up existing ones since it allows for clean(-ish) refactors against the
 * credentials subsystem. The pure data structure shape that existed previously was better, but it
 * just wouldn't be able to support refreshes on its own.
 */
export interface CredentialsShim {
    /**
     * Fetches credentials, attempting a refresh if needed.
     */
    get: () => Promise<Credentials>

    /**
     * Removes the stored credentials and performs a refresh, allowing for prompts.
     *
     * Calling this function while a refresh is still pending returns the already pending promise.
     */
    refresh: () => Promise<Credentials>
}

/**
 * Collapses a single {@link CredentialsProvider} (referenced by id) into something a bit simpler.
 *
 * We don't pass in a provider directly since {@link CredentialsProviderManager} is the true
 * source of credential state, at least as far as the Toolkit is concerned.
 */
function createCredentialsShim(
    store: CredentialsStore,
    providerId: CredentialsId,
    creds: Credentials
): CredentialsShim {
    interface State {
        credentials: Promise<Credentials>
        pendingRefresh: Promise<Credentials>
    }

    const state: Partial<State> = { credentials: Promise.resolve(creds) }

    async function refresh(): Promise<Credentials> {
        let result: Result = 'Failed'
        let credentialType: CredentialType | undefined
        let credentialSourceId: CredentialSourceId | undefined

        try {
            getLogger().debug(`credentials: refreshing provider: ${asString(providerId)}`)

            const provider = await getProvider(providerId)
            const formatProviderId = () => asString(provider.getCredentialsId())

            credentialType = provider.getTelemetryType()
            credentialSourceId = credentialsProviderToTelemetryType(provider.getProviderType())

            if (!(await provider.canAutoConnect())) {
                const message = localize('aws.credentials.expired', 'Credentials are expired or invalid, login again?')
                const resp = await vscode.window.showInformationMessage(message, localizedText.yes, localizedText.no)

                if (resp === localizedText.no) {
                    throw new ToolkitError('User cancelled login', { cancelled: true })
                }
            }

            const credentials = await provider.getCredentials()
            await store.setCredentials(credentials, provider)
            getLogger().debug(`credentials: refresh succeeded for: ${formatProviderId()}`)
            result = 'Succeeded'

            return credentials
        } catch (error) {
            if (error instanceof ToolkitError && error.cancelled) {
                result = 'Cancelled'
            } else {
                void showViewLogsMessage(`Failed to refresh credentials: ${(error as any)?.message}`)
            }

            state.credentials = undefined
            store.invalidateCredentials(providerId)
            globals.awsContext.credentialsShim = undefined
            await globals.awsContext.setCredentials(undefined, true)

            throw error
        } finally {
            telemetry.aws_refreshCredentials.emit({
                result,
                passive: true,
                credentialType,
                credentialSourceId,
            })
        }
    }

    const shim = {
        get: () => (state.credentials ??= shim.refresh()),
        refresh: () => {
            const clear = () => (state.pendingRefresh = undefined)
            state.credentials = state.pendingRefresh ??= refresh().finally(clear)

            return state.credentials
        },
    }

    return shim
}
