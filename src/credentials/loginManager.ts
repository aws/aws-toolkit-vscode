/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../shared/extensionGlobals'
import { CancellationError } from '../shared/utilities/timeoutUtils'
import { AwsContext } from '../shared/awsContext'
import { getAccountId } from '../shared/credentials/accountId'
import { getLogger } from '../shared/logger'
import { recordAwsValidateCredentials, recordVscodeActiveRegions, Result } from '../shared/telemetry/telemetry'
import { CredentialsStore } from './credentialsStore'
import { CredentialsSettings, notifyUserInvalidCredentials } from './credentialsUtilities'
import {
    asString,
    CredentialsProvider,
    CredentialsId,
    credentialsProviderToTelemetryType,
    fromString,
} from './providers/credentials'
import { CredentialsProviderManager } from './providers/credentialsProviderManager'
import { getIdeProperties, isCloud9 } from '../shared/extensionUtilities'
import { SharedCredentialsProvider } from './providers/sharedCredentialsProvider'
import { showViewLogsMessage } from '../shared/utilities/messages'
import { isAutomation } from '../shared/vscode/env'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

export class LoginManager {
    private readonly defaultCredentialsRegion = 'us-east-1'

    public constructor(
        private readonly awsContext: AwsContext,
        private readonly store: CredentialsStore,
        public readonly recordAwsValidateCredentialsFn = recordAwsValidateCredentials
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
            provider = await CredentialsProviderManager.getInstance().getCredentialsProvider(args.providerId)
            if (!provider) {
                throw new Error(`Could not find Credentials Provider for ${asString(args.providerId)}`)
            }

            const storedCredentials = await this.store.upsertCredentials(args.providerId, provider)
            if (!storedCredentials) {
                throw new Error(`No credentials found for id ${asString(args.providerId)}`)
            }

            const credentialsRegion = provider.getDefaultRegion() ?? this.defaultCredentialsRegion
            const accountId = await getAccountId(storedCredentials.credentials, credentialsRegion)
            if (!accountId) {
                throw new Error('Could not determine Account Id for credentials')
            }
            recordVscodeActiveRegions({ value: (await this.awsContext.getExplorerRegions()).length })

            await this.awsContext.setCredentials({
                credentials: storedCredentials.credentials,
                credentialsId: asString(args.providerId),
                accountId: accountId,
                defaultRegion: provider.getDefaultRegion(),
            })

            telemetryResult = 'Succeeded'
            return true
        } catch (err) {
            const credentialsId = asString(args.providerId)
            if (!CancellationError.isUserCancelled(err)) {
                const msg = `login: failed to connect with "${credentialsId}": ${(err as Error).message}`
                if (!args.passive) {
                    notifyUserInvalidCredentials(credentialsId)
                    getLogger().error(msg)
                }
            } else {
                getLogger().info(`login: cancelled credentials request from "${credentialsId}"`)
            }

            await this.logout()
            this.store.invalidateCredentials(args.providerId)
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

    /**
     * Removes Credentials from the Toolkit. Essentially the Toolkit becomes "logged out".
     */
    public async logout(force?: boolean): Promise<void> {
        await this.awsContext.setCredentials(undefined, force)
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
            getLogger().error('credentials: failed to auto-connect: %O', err)
            showViewLogsMessage(localize('AWS.credentials.autoconnect.fatal', 'Exception occurred while connecting'))
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
        } else if (provider.canAutoConnect()) {
            if (!(await loginManager.login({ passive: true, providerId: creds }))) {
                getLogger().warn('autoconnect: failed to connect: "%s"', asString(creds))
                return false
            }
            getLogger().info('autoconnect: connected: %O', asString(creds))
            if (popup) {
                vscode.window.showInformationMessage(
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
    if (defaultProfile) {
        getLogger().info('autoconnect: trying "%s"', defaultProfile)
        if (await tryConnect(providerMap[defaultProfile], !isCloud9())) {
            return
        }
    }

    // Try to auto-connect up to 3 other profiles (useful for Cloud9, ECS, …).
    for (let i = 0; i < 4 && i < profileNames.length; i++) {
        const p = profileNames[i]
        if (p === defaultName) {
            continue
        }
        getLogger().info('autoconnect: trying "%s"', p)
        if (await tryConnect(providerMap[p], !isCloud9())) {
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
