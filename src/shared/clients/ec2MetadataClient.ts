/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClassToInterfaceType } from '../utilities/tsUtils'
import { AWSError, MetadataService } from 'aws-sdk'

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
            // fetchMetadataToken is private for some reason, but has the exact token functionality
            // that we want out of the metadata service.
            // https://github.com/aws/aws-sdk-js/blob/3333f8b49283f5bbff823ab8a8469acedb7fe3d5/lib/metadata_service.js#L116-L136
            ;(this.metadata as any).fetchMetadataToken((tokenErr: AWSError, token: string) => {
                if (tokenErr) {
                    reject(tokenErr)
                    return
                }

                this.metadata.request(
                    path,
                    {
                        // By attaching the token we force the use of IMDSv2.
                        // https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-metadata-v2-how-it-works.html
                        headers: { 'x-aws-ec2-metadata-token': token },
                    },
                    (err, response) => {
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
                    }
                )
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
