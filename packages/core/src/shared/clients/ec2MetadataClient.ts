/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../logger/logger'
import { ClassToInterfaceType } from '../utilities/tsUtils'
import { httpRequest } from '@smithy/credential-provider-imds'
import { RequestOptions } from 'http'

export interface IamInfo {
    Code: string
    LastUpdated: string
    InstanceProfileArn: string
    InstanceProfileId: string
}

export interface InstanceIdentity {
    region: string
}

export type Ec2MetadataClient = ClassToInterfaceType<DefaultEc2MetadataClient>
export class DefaultEc2MetadataClient {
    private static readonly metadataServiceTimeout: number = 500
    // AWS EC2 Instance Metadata Service (IMDS) constants
    // https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-metadata-v2-how-it-works.html
    private static readonly metadataServiceHost: string = '169.254.169.254'
    private static readonly tokenPath: string = '/latest/api/token'

    public constructor() {}

    public getInstanceIdentity(): Promise<InstanceIdentity> {
        return this.invoke<InstanceIdentity>('/latest/dynamic/instance-identity/document')
    }

    public getIamInfo(): Promise<IamInfo> {
        return this.invoke<IamInfo>('/latest/meta-data/iam/info')
    }

    public async invoke<T>(path: string): Promise<T> {
        try {
            // Try to get IMDSv2 token first
            const token = await this.fetchMetadataToken()
            const headers: Record<string, string> = {}
            if (token) {
                headers['x-aws-ec2-metadata-token'] = token
            }

            const response = await this.makeRequest(path, headers)
            return JSON.parse(response.toString())
        } catch (tokenErr) {
            getLogger().warn(
                'Ec2MetadataClient failed to fetch token. If this is an EC2 environment, then Toolkit will fall back to IMDSv1: %s',
                tokenErr
            )

            // Fall back to IMDSv1 for legacy instances
            try {
                const response = await this.makeRequest(path, {})
                return JSON.parse(response.toString())
            } catch (err) {
                throw new Error(`Ec2MetadataClient: failed to fetch "${path}": ${err}`)
            }
        }
    }

    private async fetchMetadataToken(): Promise<string | undefined> {
        try {
            const options: RequestOptions = {
                host: DefaultEc2MetadataClient.metadataServiceHost,
                path: DefaultEc2MetadataClient.tokenPath,
                method: 'PUT',
                headers: {
                    'x-aws-ec2-metadata-token-ttl-seconds': '21600',
                },
                timeout: DefaultEc2MetadataClient.metadataServiceTimeout,
            }

            const response = await httpRequest(options)
            return response.toString()
        } catch (err) {
            return undefined
        }
    }

    private async makeRequest(path: string, headers: Record<string, string>): Promise<Buffer> {
        const options: RequestOptions = {
            host: DefaultEc2MetadataClient.metadataServiceHost,
            path,
            method: 'GET',
            headers,
            timeout: DefaultEc2MetadataClient.metadataServiceTimeout,
        }

        return httpRequest(options)
    }
}
