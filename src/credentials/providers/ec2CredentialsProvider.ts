/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'
import { CredentialType } from '../../shared/telemetry/telemetry.gen'
import { getStringHash } from '../../shared/utilities/textUtilities'
import { CredentialsProvider, CredentialsProviderType ,CredentialsId } from './credentials'


/**
 * Credentials received from EC2 metadata service.
 *
 * @see CredentialsProviderType
 */
export class Ec2CredentialsProvider implements CredentialsProvider {
    public constructor(private token: string) {
    }

    public getCredentialsId(): CredentialsId {
        return {
            credentialSource: this.getProviderType(),
            credentialTypeId: 'default',
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

    public getHashCode(): string {
        return getStringHash(JSON.stringify(this.token))
    }

    public getDefaultRegion(): string | undefined {
        return 'us-east-1'  // TODO: get region from metadata service
    }

    public canAutoConnect(): boolean {
        return true
    }

    public async getCredentials(): Promise<AWS.Credentials> {
        // TODO
        throw Error('not implemented')
    }
}
