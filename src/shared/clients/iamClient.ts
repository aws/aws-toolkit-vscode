/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { IAM } from 'aws-sdk'
import globals from '../extensionGlobals'
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
     */
    public async getDeniedActions(request: IAM.SimulatePrincipalPolicyRequest): Promise<IAM.EvaluationResult[]> {
        const permissionResponse = await this.simulatePrincipalPolicy(request)
        if (!permissionResponse.EvaluationResults) {
            throw new Error('No evaluation results found')
        }

        // Ignore deny from Organization SCP.  These can result in false negatives.
        // See https://github.com/aws/aws-sdk/issues/102
        return permissionResponse.EvaluationResults.filter(r => r.EvalDecision !== 'allowed' && r.OrganizationsDecisionDetail?.AllowedByOrganizations !== false)

    }

    private async createSdkClient(): Promise<IAM> {
        return await globals.sdkClientBuilder.createAwsService(IAM, undefined, this.regionCode)
    }
}
