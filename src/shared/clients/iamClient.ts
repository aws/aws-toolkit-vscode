/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { IAM } from 'aws-sdk'
import globals from '../extensionGlobals'
import { getLogger } from '../logger/logger'
import { AsyncCollection } from '../utilities/asyncCollection'
import { pageableToCollection } from '../utilities/collectionUtils'
import { ClassToInterfaceType } from '../utilities/tsUtils'

export type IamClient = ClassToInterfaceType<DefaultIamClient>

/** Do not pull more than this many pages. */
const maxPages = 500

export class DefaultIamClient {
    public constructor(public readonly regionCode: string) {}

    public getRoles(request: IAM.ListRolesRequest = {}): AsyncCollection<IAM.Role[]> {
        const requester = async (request: IAM.ListRolesRequest) =>
            (await this.createSdkClient()).listRoles(request).promise()
        const collection = pageableToCollection(requester, request, 'Marker', 'Roles')

        return collection.limit(maxPages)
    }

    /** Gets all roles. */
    public async listRoles(request: IAM.ListRolesRequest = {}): Promise<IAM.Role[]> {
        return this.getRoles(request).flatten().promise()
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

    public async simulatePrincipalPolicy(
        request: IAM.SimulatePrincipalPolicyRequest
    ): Promise<IAM.SimulatePolicyResponse> {
        const sdkClient = await this.createSdkClient()
        return await sdkClient.simulatePrincipalPolicy(request).promise()
    }

    /**
     * Attempts to verify if a role has the provided permissions.
     * @param roleArn IAM.SimulatePrinicipalPolicyRequest
     * @returns True if the role has the provided permissions. Undefined when the role is missing or the 'simulatePrincipalPolicy' call was unsuccessful.
     */
    public async hasRolePermissions(request: IAM.SimulatePrincipalPolicyRequest): Promise<boolean | undefined> {
        if (request.PolicySourceArn === undefined) {
            return undefined
        }
        try {
            const permissionResponse = await this.simulatePrincipalPolicy(request)
            if (!permissionResponse || !permissionResponse.EvaluationResults) {
                return undefined
            }
            for (const evalResult of permissionResponse.EvaluationResults) {
                if (evalResult.EvalDecision !== 'allowed') {
                    return false
                }
            }
            return true
        } catch (error) {
            getLogger().error('iam: Error during policy simulation. Skipping permissions check. Error: %O', error)
            return undefined
        }
    }

    private async createSdkClient(): Promise<IAM> {
        return await globals.sdkClientBuilder.createAwsService(IAM, undefined, this.regionCode)
    }
}
