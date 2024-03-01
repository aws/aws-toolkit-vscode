/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Credentials, CredentialProvider } from '@aws-sdk/types'
import { fromContainerMetadata } from '@aws-sdk/credential-provider-imds'
import { EnvironmentVariables } from '../../shared/environmentVariables'
import { CredentialType } from '../../shared/telemetry/telemetry.gen'
import { getStringHash } from '../../shared/utilities/textUtilities'
import { CredentialsId, CredentialsProvider, CredentialsProviderType } from './credentials'
import { getLogger } from '../../shared/logger'
import globals from '../../shared/extensionGlobals'

/**
 * Credentials received from ECS containers.
 *
 * @see CredentialsProviderType
 */
export class EcsCredentialsProvider implements CredentialsProvider {
    private available: boolean | undefined
    private readonly createTime = Date.now()

    public constructor(private provider: CredentialProvider = fromContainerMetadata()) {}

    public async isAvailable(): Promise<boolean> {
        // this check is only performed once per activation
        if (this.available !== undefined) {
            return Promise.resolve(this.available)
        }

        this.available = false
        const env = process.env as EnvironmentVariables
        if (env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || env.AWS_CONTAINER_CREDENTIALS_FULL_URI) {
            const start = globals.clock.Date.now()
            try {
                await this.provider()
                getLogger().verbose(`credentials: retrieved ECS container credentials`)

                this.available = true
            } catch (err) {
                getLogger().warn(`credentials: no role (or invalid) attached to ECS container: ${err}`)
            } finally {
                const elapsed = globals.clock.Date.now() - start
                getLogger().verbose(`credentials: ECS metadata credentials call took ${elapsed}ms`)
            }
        }
        return this.available
    }

    public getCredentialsId(): CredentialsId {
        return {
            credentialSource: this.getProviderType(),
            credentialTypeId: 'instance',
        }
    }

    public static getProviderType(): CredentialsProviderType {
        return 'ecs'
    }

    public getProviderType(): CredentialsProviderType {
        return EcsCredentialsProvider.getProviderType()
    }

    public getTelemetryType(): CredentialType {
        return 'ecsMetatdata'
    }

    public getDefaultRegion(): string | undefined {
        const env = process.env as EnvironmentVariables
        return env.AWS_DEFAULT_REGION
    }

    public getHashCode(): string {
        return getStringHash(this.getProviderType() + `-${this.createTime}`)
    }

    public async canAutoConnect(): Promise<boolean> {
        return true
    }

    public async getCredentials(): Promise<Credentials> {
        return this.provider()
    }
}
