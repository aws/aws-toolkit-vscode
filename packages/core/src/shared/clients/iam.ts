/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttachedPolicy,
    AttachRolePolicyCommand,
    AttachRolePolicyRequest,
    CreateRoleCommand,
    CreateRoleRequest,
    CreateRoleResponse,
    EvaluationResult,
    GetInstanceProfileCommand,
    IAMClient,
    ListRolesRequest,
    paginateListAttachedRolePolicies,
    paginateListRoles,
    PutRolePolicyCommand,
    Role,
    SimulatePolicyResponse,
    SimulatePrincipalPolicyCommand,
    SimulatePrincipalPolicyRequest,
} from '@aws-sdk/client-iam'
import { AsyncCollection } from '../utilities/asyncCollection'
import { ToolkitError } from '../errors'
import { ClientWrapper } from './clientWrapper'

export class IamClient extends ClientWrapper<IAMClient> {
    public constructor(public override readonly regionCode: string) {
        super(regionCode, IAMClient)
    }

    public getRoles(request: ListRolesRequest = {}, maxPages: number = 500): AsyncCollection<Role[]> {
        return this.makePaginatedRequest(paginateListRoles, request, (p) => p.Roles).limit(maxPages)
    }

    /** Gets all roles. */
    public async resolveRoles(request: ListRolesRequest = {}): Promise<Role[]> {
        return this.getRoles(request).flatten().promise()
    }

    public async createRole(request: CreateRoleRequest): Promise<CreateRoleResponse> {
        return await this.makeRequest(CreateRoleCommand, request)
    }

    public async attachRolePolicy(request: AttachRolePolicyRequest): Promise<AttachRolePolicyCommand> {
        return await this.makeRequest(AttachRolePolicyCommand, request)
    }

    public async simulatePrincipalPolicy(request: SimulatePrincipalPolicyRequest): Promise<SimulatePolicyResponse> {
        return await this.makeRequest(SimulatePrincipalPolicyCommand, request)
    }

    /**
     * Attempts to verify if a role has the provided permissions.
     */
    public async getDeniedActions(request: SimulatePrincipalPolicyRequest): Promise<EvaluationResult[]> {
        const permissionResponse = await this.simulatePrincipalPolicy(request)
        if (!permissionResponse.EvaluationResults) {
            throw new Error('No evaluation results found')
        }

        // Ignore deny from Organization SCP.  These can result in false negatives.
        // See https://github.com/aws/aws-sdk/issues/102
        return permissionResponse.EvaluationResults.filter(
            (r) => r.EvalDecision !== 'allowed' && r.OrganizationsDecisionDetail?.AllowedByOrganizations !== false
        )
    }

    public getFriendlyName(arn: string): string {
        const tokens = arn.split('/')
        if (tokens.length < 2) {
            throw new Error(`Invalid IAM role ARN (expected format: arn:aws:iam::{id}/{name}): ${arn}`)
        }
        return tokens[tokens.length - 1]
    }

    public listAttachedRolePolicies(arn: string): AsyncCollection<AttachedPolicy[]> {
        return this.makePaginatedRequest(
            paginateListAttachedRolePolicies,
            {
                RoleName: this.getFriendlyName(arn),
            },
            (p) => p.AttachedPolicies
        )
    }

    public async getIAMRoleFromInstanceProfile(instanceProfileArn: string): Promise<Role> {
        const response = await this.makeRequest(GetInstanceProfileCommand, {
            InstanceProfileName: this.getFriendlyName(instanceProfileArn),
        })
        if (response.InstanceProfile.Roles.length === 0) {
            throw new ToolkitError(`Failed to find IAM role associated with Instance profile ${instanceProfileArn}`)
        }
        return response.InstanceProfile.Roles[0]
    }

    public async putRolePolicy(roleArn: string, policyName: string, policyDocument: string): Promise<void> {
        return await this.makeRequest(PutRolePolicyCommand, {
            RoleName: this.getFriendlyName(roleArn),
            PolicyName: policyName,
            PolicyDocument: policyDocument,
        })
    }
}
