/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { Session } from 'aws-sdk/clients/ssm'
import { AWSError, IAM } from 'aws-sdk'
import { Ec2Selection } from './utils'
import { getOrInstallCli } from '../shared/utilities/cliUtils'
import { isCloud9 } from '../shared/extensionUtilities'
import { ToolkitError, isAwsError } from '../shared/errors'
import { DefaultSsmClient } from '../shared/clients/ssmClient'
import { showMessageWithUrl } from '../shared/utilities/messages'
import { DefaultEc2Client } from '../shared/clients/ec2Client'

export type Ec2ConnectErrorName = 'permission' | 'instanceStatus'
export interface Ec2ConnectErrorParameters {
    message: string
    url?: string
    urlItem?: string
}
import { openRemoteTerminal } from '../shared/remoteSession'
import { DefaultIamClient } from '../shared/clients/iamClient'

export class Ec2ConnectClient {
    private ssmClient: DefaultSsmClient
    private ec2Client: DefaultEc2Client
    private iamClient: DefaultIamClient

    public constructor(readonly regionCode: string) {
        this.ssmClient = this.createSsmSdkClient()
        this.ec2Client = this.createEc2SdkClient()
        this.iamClient = this.createIamSdkClient()
    }

    protected createSsmSdkClient(): DefaultSsmClient {
        return new DefaultSsmClient(this.regionCode)
    }

    protected createEc2SdkClient(): DefaultEc2Client {
        return new DefaultEc2Client(this.regionCode)
    }

    protected createIamSdkClient(): DefaultIamClient {
        return new DefaultIamClient(this.regionCode)
    }

    protected async showConnectError(
        errorName: Ec2ConnectErrorName,
        params: Ec2ConnectErrorParameters
    ): Promise<string> {
        switch (errorName) {
            case 'instanceStatus':
                return (await vscode.window.showErrorMessage(params.message))!
            case 'permission':
                return (await showMessageWithUrl(params.message, params.url!, params.urlItem!, 'error'))!
        }
    }

    protected async getAttachedPolicies(instanceId: string): Promise<IAM.attachedPoliciesListType> {
        try {
            const IamRole = await this.ec2Client.getAttachedIamRole(instanceId)
            const iamResponse = await this.iamClient.listAttachedRolePolicies(IamRole!.Arn!)
            return iamResponse.AttachedPolicies!
        } catch (err) {
            return []
        }
    }

    public async hasProperPolicies(instanceId: string): Promise<boolean> {
        const attachedPolicies = (await this.getAttachedPolicies(instanceId)).map(policy => policy.PolicyName!)
        const requiredPolicies = ['AmazonSSMManagedInstanceCore', 'AmazonSSMManagedEC2InstanceDefaultPolicy']

        return requiredPolicies.every(policy => attachedPolicies.includes(policy))
    }

    public async handleStartSessionError(err: AWSError, selection: Ec2Selection): Promise<string> {
        const isInstanceRunning = await this.ec2Client.isInstanceRunning(selection.instanceId)
        const generalErrorMessage = `Unable to connect to target instance ${selection.instanceId} on region ${selection.region}. `
        const hasProperPolicies = await this.hasProperPolicies(selection.instanceId)

        if (!isInstanceRunning) {
            const errorParams: Ec2ConnectErrorParameters = {
                message:
                    generalErrorMessage +
                    'Please ensure the target instance is running and not currently starting, stopping, or stopped.',
            }
            return await this.showConnectError('instanceStatus', errorParams)
        }

        if (!hasProperPolicies) {
            const errorParams: Ec2ConnectErrorParameters = {
                message:
                    generalErrorMessage +
                    'Please ensure the IAM role attached to the instance has the proper policies.',
                url: 'https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-getting-started-instance-profile.html',
                urlItem: 'See Policies needed for SSM',
            }
            return await this.showConnectError('permission', errorParams)
        }

        throw new ToolkitError('Unknown error unencountered when attempting to start session.', err)
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

    public async attemptEc2Connection(selection: Ec2Selection): Promise<void> {
        try {
            const response = await this.ssmClient.startSession(selection.instanceId)
            await this.openSessionInTerminal(response, selection)
        } catch (err) {
            if (isAwsError(err)) {
                await this.handleStartSessionError(err, selection)
            } else {
                throw err
            }
        }
    }
}
