/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { Session } from 'aws-sdk/clients/ssm'
import { IAM } from 'aws-sdk'
import { Ec2Selection } from './utils'
import { getOrInstallCli } from '../shared/utilities/cliUtils'
import { isCloud9 } from '../shared/extensionUtilities'
import { ToolkitError } from '../shared/errors'
import { SsmClient } from '../shared/clients/ssmClient'
import { Ec2Client } from '../shared/clients/ec2Client'

export type Ec2ConnectErrorCode = 'EC2SSMStatus' | 'EC2SSMPermission' | 'EC2SSMConnect' | 'EC2SSMAgentStatus'

import { openRemoteTerminal } from '../shared/remoteSession'
import { DefaultIamClient } from '../shared/clients/iamClient'
import { ErrorInformation } from '../shared/errors'
import { getLogger } from '../shared/logger'

export class Ec2ConnectionManager {
    private ssmClient: SsmClient
    private ec2Client: Ec2Client
    private iamClient: DefaultIamClient

    private policyDocumentationUri = vscode.Uri.parse(
        'https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-getting-started-instance-profile.html'
    )

    private ssmAgentDocumentationUri = vscode.Uri.parse(
        'https://docs.aws.amazon.com/systems-manager/latest/userguide/ssm-agent.html'
    )

    public constructor(readonly regionCode: string) {
        this.ssmClient = this.createSsmSdkClient()
        this.ec2Client = this.createEc2SdkClient()
        this.iamClient = this.createIamSdkClient()
    }

    protected createSsmSdkClient(): SsmClient {
        return new SsmClient(this.regionCode)
    }

    protected createEc2SdkClient(): Ec2Client {
        return new Ec2Client(this.regionCode)
    }

    protected createIamSdkClient(): DefaultIamClient {
        return new DefaultIamClient(this.regionCode)
    }

    public async getAttachedIamRole(instanceId: string): Promise<IAM.Role> {
        const IamInstanceProfile = await this.ec2Client.getAttachedIamInstanceProfile(instanceId)
        if (IamInstanceProfile && IamInstanceProfile.Arn) {
            const IamRole = await this.iamClient.getIAMRoleFromInstanceProfile(IamInstanceProfile.Arn)
            return IamRole
        }
        throw new ToolkitError(`No IAM instance profile attached to instance ${instanceId}`, {
            code: 'NoIamInstanceProfile',
        })
    }

    protected async getAttachedPolicies(instanceId: string): Promise<IAM.AttachedPolicy[]> {
        try {
            const IamRole = await this.getAttachedIamRole(instanceId)
            const attachedPolicies = await this.iamClient.listAttachedRolePolicies(IamRole.Arn)
            return attachedPolicies
        } catch (e) {
            if (e instanceof ToolkitError && e.code == 'NoIamInstanceProfile') {
                getLogger().warn(
                    `ec2: failed to find IAM Instance Profile associated with instance. Returning no policies attached for instance: ${instanceId}`
                )
                return []
            }
            throw e
        }
    }

    public async hasProperPolicies(instanceId: string): Promise<boolean> {
        const attachedPolicies = (await this.getAttachedPolicies(instanceId)).map(policy => policy.PolicyName!)
        const requiredPolicies = ['AmazonSSMManagedInstanceCore', 'AmazonSSMManagedEC2InstanceDefaultPolicy']

        return requiredPolicies.length !== 0 && requiredPolicies.every(policy => attachedPolicies.includes(policy))
    }

    public async isInstanceRunning(instanceId: string): Promise<boolean> {
        const instanceStatus = await this.ec2Client.getInstanceStatus(instanceId)
        return instanceStatus == 'running'
    }

    protected throwConnectionError(message: string, selection: Ec2Selection, errorInfo: ErrorInformation) {
        const generalErrorMessage = `Unable to connect to target instance ${selection.instanceId} on region ${selection.region}. `
        throw new ToolkitError(generalErrorMessage + message, errorInfo)
    }

    private async getPolicyErrorText(selection: Ec2Selection): Promise<string> {
        try {
            const role = await this.getAttachedIamRole(selection.instanceId)
            return `Found attached role ${role.Arn}.`
        } catch (e) {
            return `Failed to find role attached to ${selection.instanceId}`
        }
    }

    protected async throwPolicyError(selection: Ec2Selection) {
        const baseMessage = 'Ensure an IAM role with the required policies is attached to the instance.'
        const roleText = await this.getPolicyErrorText(selection)
        const fullMessage = `${baseMessage} ${roleText}`
        this.throwConnectionError(fullMessage, selection, {
            code: 'EC2SSMPermission',
            documentationUri: this.policyDocumentationUri,
        })
    }

    public async checkForStartSessionError(selection: Ec2Selection): Promise<void> {
        const isInstanceRunning = await this.isInstanceRunning(selection.instanceId)
        const hasProperPolicies = await this.hasProperPolicies(selection.instanceId)
        const isSsmAgentRunning = (await this.ssmClient.getInstanceAgentPingStatus(selection.instanceId)) == 'Online'

        if (!isInstanceRunning) {
            const message = 'Ensure the target instance is running and not currently starting, stopping, or stopped.'
            this.throwConnectionError(message, selection, { code: 'EC2SSMStatus' })
        }

        if (!hasProperPolicies) {
            await this.throwPolicyError(selection)
        }

        if (!isSsmAgentRunning) {
            this.throwConnectionError('Is SSM Agent running on the target instance?', selection, {
                code: 'EC2SSMAgentStatus',
                documentationUri: this.ssmAgentDocumentationUri,
            })
        }
    }

    private async openSessionInTerminal(session: Session, selection: Ec2Selection) {
        const ssmPlugin = await getOrInstallCli('session-manager-plugin', !isCloud9)
        const shellArgs = [JSON.stringify(session), selection.region, 'StartSession']
        const terminalOptions = {
            name: selection.region + '/' + selection.instanceId,
            shellPath: ssmPlugin,
            shellArgs: shellArgs,
        }

        await openRemoteTerminal(terminalOptions, () => this.ssmClient.terminateSession(session)).catch(err => {
            throw ToolkitError.chain(err, 'Failed to open ec2 instance.')
        })
    }

    public async attemptToOpenEc2Terminal(selection: Ec2Selection): Promise<void> {
        await this.checkForStartSessionError(selection)
        try {
            const response = await this.ssmClient.startSession(selection.instanceId)
            await this.openSessionInTerminal(response, selection)
        } catch (err: unknown) {
            // Default error if pre-check fails.
            this.throwConnectionError('Unable to connect to target instance. ', selection, {
                code: 'EC2SSMConnect',
                cause: err as Error,
            })
        }
    }
}
