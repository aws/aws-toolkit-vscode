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
import { SsmClient } from '../shared/clients/ssmClient'
import { Ec2Client } from '../shared/clients/ec2Client'

export type Ec2ConnectErrorCode = 'EC2SSMStatus' | 'EC2SSMPermission' | 'EC2SSMConnect'

import { openRemoteTerminal } from '../shared/remoteSession'
import { DefaultIamClient } from '../shared/clients/iamClient'
import { telemetry } from '../shared/telemetry/telemetry'

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

    public async handleStartSessionError(err: AWSError, selection: Ec2Selection): Promise<Error> {
        const isInstanceRunning = (await this.ec2Client.getInstanceStatus(selection.instanceId)) == 'running'
        const generalErrorMessage = `Unable to connect to target instance ${selection.instanceId} on region ${selection.region}. `
        const hasProperPolicies = await this.hasProperPolicies(selection.instanceId)

        if (!isInstanceRunning) {
            telemetry.record({ result: 'Failed', reason: 'EC2SSMStatus' })
            throw new ToolkitError(
                generalErrorMessage +
                    'Ensure the target instance is running and not currently starting, stopping, or stopped.',
                { code: 'EC2SSMStatus' }
            )
        }

        if (!hasProperPolicies) {
            telemetry.record({ result: 'Failed', reason: 'EC2SSMPermission' })
            throw new ToolkitError(
                generalErrorMessage + 'Ensure the IAM role attached to the instance has the required policies.',
                {
                    code: 'EC2SSMPermission',
                    documentationUri: vscode.Uri.parse(
                        'https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-getting-started-instance-profile.html'
                    ),
                }
            )
        }
        telemetry.record({ result: 'Failed', reason: 'EC2SSMConnect' })

        throw new ToolkitError(
            'Ensure SSM is running on target instance. For more information see the documentation.',
            {
                code: 'EC2SSMConnect',
                documentationUri: vscode.Uri.parse(
                    'https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-getting-started.html'
                ),
            }
        )
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
