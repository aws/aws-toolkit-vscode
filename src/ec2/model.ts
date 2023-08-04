/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { Session } from 'aws-sdk/clients/ssm'
import { IAM } from 'aws-sdk'
import { Ec2Selection } from './prompter'
import { getOrInstallCli } from '../shared/utilities/cliUtils'
import { isCloud9 } from '../shared/extensionUtilities'
import { ToolkitError } from '../shared/errors'
import { SsmClient } from '../shared/clients/ssmClient'
import { Ec2Client } from '../shared/clients/ec2Client'

export type Ec2ConnectErrorCode = 'EC2SSMStatus' | 'EC2SSMPermission' | 'EC2SSMConnect' | 'EC2SSMAgentStatus'

import { openRemoteTerminal } from '../shared/remoteSession'
import { DefaultIamClient } from '../shared/clients/iamClient'
import { ErrorInformation } from '../shared/errors'

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

    public async getAttachedIamRole(instanceId: string): Promise<IAM.Role | undefined> {
        const IamInstanceProfile = await this.ec2Client.getAttachedIamInstanceProfile(instanceId)
        if (IamInstanceProfile && IamInstanceProfile.Arn) {
            const IamRole = await this.iamClient.getIAMRoleFromInstanceProfile(IamInstanceProfile.Arn)
            return IamRole
        }
    }

    public async hasProperPolicies(IamRoleArn: string): Promise<boolean> {
        const attachedPolicies = (await this.iamClient.listAttachedRolePolicies(IamRoleArn)).map(
            policy => policy.PolicyName!
        )
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

    private async checkForInstanceStatusError(selection: Ec2Selection): Promise<void> {
        const isInstanceRunning = await this.isInstanceRunning(selection.instanceId)

        if (!isInstanceRunning) {
            const message = 'Ensure the target instance is running.'
            this.throwConnectionError(message, selection, { code: 'EC2SSMStatus' })
        }
    }

    private async checkForInstancePermissionsError(selection: Ec2Selection): Promise<void> {
        const IamRole = await this.getAttachedIamRole(selection.instanceId)

        if (!IamRole) {
            const message = `No IAM role attached to instance: ${selection.instanceId}`
            this.throwConnectionError(message, selection, { code: 'EC2SSMPermission' })
        }

        const hasProperPolicies = await this.hasProperPolicies(IamRole!.Arn)

        if (!hasProperPolicies) {
            const message = `Ensure an IAM role with the required policies is attached to the instance. Found attached role: ${
                IamRole!.Arn
            }`
            this.throwConnectionError(message, selection, {
                code: 'EC2SSMPermission',
                documentationUri: this.policyDocumentationUri,
            })
        }
    }

    private async checkForInstanceSsmError(selection: Ec2Selection): Promise<void> {
        const isSsmAgentRunning = (await this.ssmClient.getInstanceAgentPingStatus(selection.instanceId)) == 'Online'

        if (!isSsmAgentRunning) {
            this.throwConnectionError('Is SSM Agent running on the target instance?', selection, {
                code: 'EC2SSMAgentStatus',
                documentationUri: this.ssmAgentDocumentationUri,
            })
        }
    }

    public async checkForStartSessionError(selection: Ec2Selection): Promise<void> {
        await this.checkForInstanceStatusError(selection)

        await this.checkForInstancePermissionsError(selection)

        await this.checkForInstanceSsmError(selection)
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
