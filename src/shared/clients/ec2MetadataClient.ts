/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface IamInfo {
    Code: string
    LastUpdated: string
    InstanceProfileArn: string
    InstanceProfileId: string
}

export interface InstanceIdentity {
    region: string
}

export interface Ec2MetadataClient {
    getIamInfo(): Promise<IamInfo>
    getInstanceIdentity(): Promise<InstanceIdentity>
}
