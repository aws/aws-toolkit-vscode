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

    public async listRoles(): Promise<IAM.ListRolesResponse> {
        const listRolesPageSize = 1000
        const sdkClient = await this.createSdkClient()
        const response = await sdkClient.listRoles({ MaxItems: listRolesPageSize }).promise()

        return response
    }

    private async createSdkClient(): Promise<IAM> {
        return await ext.sdkClientBuilder.createAwsService(IAM, undefined, this.regionCode)
    }
}
