/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Credentials, EC2MetadataCredentials } from 'aws-sdk'
import { DefaultEc2MetadataClient } from '../../shared/clients/defaultEc2MetadataClient'
import { Ec2MetadataClient } from '../../shared/clients/ec2MetadataClient'
import { getLogger } from '../../shared/logger'
import { CredentialType } from '../../shared/telemetry/telemetry.gen'
import { getStringHash } from '../../shared/utilities/textUtilities'
import { CredentialsId, CredentialsProvider, CredentialsProviderType } from './credentials'

/**
 * Credentials received from EC2 metadata service.
 *
 * @see CredentialsProviderType
 */
export class Ec2CredentialsProvider implements CredentialsProvider {
    private credentials: EC2MetadataCredentials | undefined
    private region: string | undefined
    private available: boolean | undefined

    public constructor(private metadata: Ec2MetadataClient = new DefaultEc2MetadataClient()) {}

    public async isAvailable(): Promise<boolean> {
        // this check is only performed once per activation
        if (this.available !== undefined) {
            return Promise.resolve(this.available)
        }

        const start = Date.now()
        try {
            const identity = await this.metadata.getInstanceIdentity()
            if (identity.region) {
                this.region = identity.region
                getLogger().verbose(`credentials: EC2 metadata region: ${this.region}`)
            }
            return true
        } catch (err) {
            getLogger().verbose(`credentials: EC2 metadata service unavailable: ${err}`)
            return false
        } finally {
            const elapsed = Date.now() - start
            getLogger().verbose(`credentials: EC2 metadata service call took ${elapsed}ms`)
        }
    }

    public getCredentialsId(): CredentialsId {
        return {
            credentialSource: this.getProviderType(),
            credentialTypeId: 'instance',
        }
    }

    public static getProviderType(): CredentialsProviderType {
        return 'ec2'
    }

    public getProviderType(): CredentialsProviderType {
        return Ec2CredentialsProvider.getProviderType()
    }

    public getTelemetryType(): CredentialType {
        return 'ec2Metadata'
    }

    public getDefaultRegion(): string | undefined {
        return this.region
    }

    public getHashCode(): string {
        return getStringHash(JSON.stringify(this.credentials))
    }

    public canAutoConnect(): boolean {
        return true
    }

    public async getCredentials(): Promise<Credentials> {
        if (!this.credentials) {
            this.credentials = new EC2MetadataCredentials()
        }
        return this.credentials
    }
}
