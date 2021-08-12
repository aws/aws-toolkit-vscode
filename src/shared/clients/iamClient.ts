/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { IAM } from 'aws-sdk'
import { ext } from '../extensionGlobals'
import { ClassToInterfaceType } from '../utilities/tsUtils'

export type IamClient = ClassToInterfaceType<DefaultIamClient>
export class DefaultIamClient {
    public constructor(public readonly regionCode: string) {}

    public async listRoles(request: IAM.ListRolesRequest = {}): Promise<IAM.ListRolesResponse> {
        const sdkClient = await this.createSdkClient()
        const response = await sdkClient.listRoles(request).promise()

        return response
    }

    public async createRole(request: IAM.CreateRoleRequest): Promise<IAM.CreateRoleResponse> {
        const sdkClient = await this.createSdkClient()
        const response = await sdkClient.createRole(request).promise()

        return response
    }

    public async attachRolePolicy(request: IAM.AttachRolePolicyRequest): Promise<void> {
        const sdkClient = await this.createSdkClient()
        await sdkClient.attachRolePolicy(request).promise()
    }

    private async createSdkClient(): Promise<IAM> {
        return await ext.sdkClientBuilder.createAwsService(IAM, undefined, this.regionCode)
    }
}
