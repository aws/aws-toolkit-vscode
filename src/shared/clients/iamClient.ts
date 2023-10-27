/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */



import {
    AttachedPolicy,
    AttachRolePolicyCommandInput,
    CreateRoleCommandInput,
    CreateRoleCommandOutput,
    EvaluationResult,
    IAM,
    ListAttachedRolePoliciesCommandInput,
    ListRolesCommandInput,
    Role,
    SimulatePrincipalPolicyCommandInput,
    SimulatePrincipalPolicyCommandOutput,
} from "@aws-sdk/client-iam";

import globals from '../extensionGlobals'
import { AsyncCollection } from '../utilities/asyncCollection'
import { pageableToCollection } from '../utilities/collectionUtils'
import { ClassToInterfaceType } from '../utilities/tsUtils'
import { ToolkitError } from '../errors'

export type IamClient = ClassToInterfaceType<DefaultIamClient>

/** Do not pull more than this many pages. */
const maxPages = 500

export class DefaultIamClient {
    public constructor(public readonly regionCode: string) {}

    public getRoles(request: ListRolesCommandInput = {}): AsyncCollection<Role[]> {
        const requester = async (request: ListRolesCommandInput) =>
            (await this.createSdkClient()).listRoles(request).promise()
        const collection = pageableToCollection(requester, request, 'Marker', 'Roles')

        return collection.limit(maxPages)
    }

    /** Gets all roles. */
    public async listRoles(request: ListRolesCommandInput = {}): Promise<Role[]> {
        return this.getRoles(request).flatten().promise()
    }

    public async createRole(request: CreateRoleCommandInput): Promise<CreateRoleCommandOutput> {
        const sdkClient = await this.createSdkClient()
        const response = await sdkClient.createRole(request).promise()

        return response
    }

    public async attachRolePolicy(request: AttachRolePolicyCommandInput): Promise<void> {
        const sdkClient = await this.createSdkClient()
        await sdkClient.attachRolePolicy(request).promise()
    }

    public async simulatePrincipalPolicy(
        request: SimulatePrincipalPolicyCommandInput
    ): Promise<SimulatePrincipalPolicyCommandOutput> {
        const sdkClient = await this.createSdkClient()
        return await sdkClient.simulatePrincipalPolicy(request).promise()
    }

    /**
     * Attempts to verify if a role has the provided permissions.
     */
    public async getDeniedActions(request: SimulatePrincipalPolicyCommandInput): Promise<EvaluationResult[]> {
        const permissionResponse = await this.simulatePrincipalPolicy(request)
        if (!permissionResponse.EvaluationResults) {
            throw new Error('No evaluation results found')
        }

        // Ignore deny from Organization SCP.  These can result in false negatives.
        // See https://github.com/aws/aws-sdk/issues/102
        return permissionResponse.EvaluationResults.filter(
            r => r.EvalDecision !== 'allowed' && r.OrganizationsDecisionDetail?.AllowedByOrganizations !== false
        )
    }

    private async createSdkClient(): Promise<IAM> {
        return await globals.sdkClientBuilder.createAwsService(IAM, undefined, this.regionCode)
    }

    public getFriendlyName(arn: string): string {
        const tokens = arn.split('/')
        if (tokens.length < 2) {
            throw new Error(`Invalid IAM role ARN (expected format: arn:aws:iam::{id}/{name}): ${arn}`)
        }
        return tokens[tokens.length - 1]
    }

    public async listAttachedRolePolicies(arn: string): Promise<AttachedPolicy[]> {
        const client = await this.createSdkClient()
        const roleName = this.getFriendlyName(arn)

        const requester = async (request: ListAttachedRolePoliciesCommandInput) =>
            client.listAttachedRolePolicies(request).promise()

        const collection = pageableToCollection(requester, { RoleName: roleName }, 'Marker', 'AttachedPolicies')
            .flatten()
            .filter(p => p !== undefined)
            .map(p => p!)

        const policies = await collection.promise()

        return policies
    }

    public async getIAMRoleFromInstanceProfile(instanceProfileArn: string): Promise<Role> {
        const client = await this.createSdkClient()
        const instanceProfileName = this.getFriendlyName(instanceProfileArn)
        const response = await client.getInstanceProfile({ InstanceProfileName: instanceProfileName }).promise()
        if (response.InstanceProfile.Roles.length === 0) {
            throw new ToolkitError(`Failed to find IAM role associated with Instance profile ${instanceProfileArn}`)
        }
        return response.InstanceProfile.Roles[0]
    }
}
