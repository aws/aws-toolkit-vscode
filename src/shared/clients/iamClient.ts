/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { IAM } from 'aws-sdk'
import { ext } from '../extensionGlobals'
import { AsyncCollection, pageableToCollection } from '../utilities/collectionUtils'
import { ClassToInterfaceType } from '../utilities/tsUtils'

export type IamClient = ClassToInterfaceType<DefaultIamClient>
export class DefaultIamClient {
    public constructor(public readonly regionCode: string) {}

    public listRoles(request: IAM.ListRolesRequest = {}): AsyncCollection<IAM.Role[]> {
        const sdkClient = this.createSdkClient()
        const requester = async (request: IAM.ListRolesRequest) => (await sdkClient).listRoles(request).promise()

        return pageableToCollection(requester, request, 'Marker', 'Roles')
    }

    public listAllRoles(request: IAM.ListRolesRequest = {}): Promise<IAM.Role[]> {
        return this.listRoles(request).flatten().promise()
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
