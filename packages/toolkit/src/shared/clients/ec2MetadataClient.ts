/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClassToInterfaceType } from '../utilities/tsUtils'
import { MetadataService } from 'aws-sdk'

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

    public constructor(private metadata: MetadataService = DefaultEc2MetadataClient.getMetadataService()) {}

    public getInstanceIdentity(): Promise<InstanceIdentity> {
        return this.invoke<InstanceIdentity>('/latest/dynamic/instance-identity/document')
    }

    public getIamInfo(): Promise<IamInfo> {
        return this.invoke<IamInfo>('/latest/meta-data/iam/info')
    }

    public invoke<T>(path: string): Promise<T> {
        return new Promise((resolve, reject) => {
            this.metadata.request(path, (err, response) => {
                if (err) {
                    reject(err)
                    return
                }
                try {
                    const jsonResponse: T = JSON.parse(response)
                    resolve(jsonResponse)
                } catch (e) {
                    reject(`Ec2MetadataClient: invalid response from "${path}": ${response}\nerror: ${e}`)
                }
            })
        })
    }

    private static getMetadataService() {
        return new MetadataService({
            httpOptions: {
                timeout: DefaultEc2MetadataClient.metadataServiceTimeout,
                connectTimeout: DefaultEc2MetadataClient.metadataServiceTimeout,
            } as any,
            // workaround for known bug: https://github.com/aws/aws-sdk-js/issues/3029
        })
    }
}
