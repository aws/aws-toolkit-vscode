/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { IAM } from 'aws-sdk'
import globals from '../extensionGlobals'
import { getLogger } from '../logger/logger'
import { ClassToInterfaceType } from '../utilities/tsUtils'

export type IamClient = ClassToInterfaceType<DefaultIamClient>

/** Do not pull more than this many pages. */
const maxPages = 500

export class DefaultIamClient {
    public constructor(public readonly regionCode: string) {}

    /** Iterates all roles. */
    public async *getRoles(request: IAM.ListRolesRequest = {}): AsyncIterableIterator<IAM.Role> {
        request = { ...request }
        const sdkClient = await this.createSdkClient()

        for (let i = 0; true; i++) {
            const response = await sdkClient.listRoles(request).promise()
            for (const role of response.Roles) {
                yield role
            }
            if (!response.IsTruncated) {
                break
            }
            if (i > maxPages) {
                getLogger().warn('getRoles: too many pages')
                break
            }
            request.Marker = response.Marker
        }
    }

    /** Gets all roles. */
    public async listRoles(request: IAM.ListRolesRequest = {}): Promise<IAM.Role[]> {
        const roles: IAM.Role[] = []
        for await (const role of this.getRoles(request)) {
            roles.push(role)
        }
        return roles
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
        return await globals.sdkClientBuilder.createAwsService(IAM, undefined, this.regionCode)
    }
}
