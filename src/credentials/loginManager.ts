/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CancellationError } from '../shared/utilities/timeoutUtils'
import { AwsContext } from '../shared/awsContext'
import { getAccountId } from '../shared/credentials/accountId'
import { getLogger } from '../shared/logger'
import { recordAwsValidateCredentials, recordVscodeActiveRegions, Result } from '../shared/telemetry/telemetry'
import { CredentialsStore } from './credentialsStore'
import { notifyUserInvalidCredentials } from './credentialsUtilities'
import {
    asString,
    CredentialsProvider,
    CredentialsId,
    credentialsProviderToTelemetryType,
} from './providers/credentials'
import { CredentialsProviderManager } from './providers/credentialsProviderManager'

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
            if (!CancellationError.isUserCancelled(err)) {
                const msg = `login: failed to connect with "${asString(args.providerId)}": ${(err as Error).message}`
                if (!args.passive) {
                    notifyUserInvalidCredentials(args.providerId)
                    getLogger().error(msg)
                }
            } else {
                getLogger().info(`login: cancelled credentials request from "${asString(args.providerId)}"`)
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
}
