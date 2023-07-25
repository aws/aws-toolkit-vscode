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

    protected async getAttachedPolicies(instanceId: string): Promise<IAM.AttachedPolicy[]> {
        const IamRole = await this.ec2Client.getAttachedIamRole(instanceId)
        if (!IamRole?.Arn) {
            return []
        }
        try {
            const attachedPolicies = await this.iamClient.listAttachedRolePolicies(IamRole.Arn)
            return attachedPolicies
        } catch (e) {
            const errorMessage = `No policies attached to role: ${IamRole.Arn}.`
            getLogger().error(`ec2: ${errorMessage}`)
            throw ToolkitError.chain(e, errorMessage, { code: 'NoSuchEntity' })
        }
    }

    public async hasProperPolicies(instanceId: string): Promise<boolean> {
        try {
            const attachedPolicies = (await this.getAttachedPolicies(instanceId)).map(policy => policy.PolicyName!)
            const requiredPolicies = ['AmazonSSMManagedInstanceCore', 'AmazonSSMManagedEC2InstanceDefaultPolicy']

            return requiredPolicies.length !== 0 && requiredPolicies.every(policy => attachedPolicies.includes(policy))
        } catch (e) {
            if (e instanceof ToolkitError && e.code == 'NoSuchEntity') {
                getLogger().warn(
                    `ec2: due to error in checking policies attached to instance, assuming necessary policies do not exist for instance ${instanceId}.`
                )
                return false
            }
            throw new ToolkitError(`An unknown error occurred when checking the policies for ${instanceId}`, {
                cause: e as Error,
                code: 'PolicyCheckError',
            })
        }
    }

    public async isInstanceRunning(instanceId: string): Promise<boolean> {
        const instanceStatus = await this.ec2Client.getInstanceStatus(instanceId)
        return instanceStatus == 'running'
    }

    private throwConnectionError(message: string, selection: Ec2Selection, errorInfo: ErrorInformation) {
        const generalErrorMessage = `Unable to connect to target instance ${selection.instanceId} on region ${selection.region}. `
        throw new ToolkitError(generalErrorMessage + message, errorInfo)
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
            const message = 'Ensure the IAM role attached to the instance has the required policies.'
            const documentationUri = vscode.Uri.parse(
                'https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-getting-started-instance-profile.html'
            )
            this.throwConnectionError(message, selection, {
                code: 'EC2SSMPermission',
                documentationUri: documentationUri,
            })
        }

        if (!isSsmAgentRunning) {
            this.throwConnectionError('Is SSM Agent running on the target instance?', selection, {
                code: 'EC2SSMAgentStatus',
                documentationUri: vscode.Uri.parse(
                    'https://docs.aws.amazon.com/systems-manager/latest/userguide/ssm-agent.html'
                ),
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
