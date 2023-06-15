/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { AWSError, EC2, SSM } from 'aws-sdk'
import globals from '../shared/extensionGlobals'
import { Session } from 'aws-sdk/clients/ssm'
import { Ec2Selection, getInstanceIdsFromClient } from './utils'
import { getOrInstallCli } from '../shared/utilities/cliUtils'
import { isCloud9 } from '../shared/extensionUtilities'
import { withoutShellIntegration } from '../ecs/commands'
import { ToolkitError } from '../shared/errors'
import { AsyncCollection } from '../shared/utilities/asyncCollection'
import { getLogger } from '../shared/logger'
import { PromiseResult } from 'aws-sdk/lib/request'
import { pageableToCollection } from '../shared/utilities/collectionUtils'
import { showMessageWithUrl } from '../shared/utilities/messages'

export type Ec2ConnectErrorName = "permission" | "instanceStatus"
export interface Ec2ConnectErrorParameters {
    message: string
    url?: string 
    urlItem?: string
}

export class Ec2ConnectClient {
    public constructor(readonly regionCode: string) {}

    protected async createEc2SdkClient(): Promise<EC2> {
        return await globals.sdkClientBuilder.createAwsService(EC2, undefined, this.regionCode)
    }

    protected async createSsmSdkClient(): Promise<SSM> {
        return await globals.sdkClientBuilder.createAwsService(SSM, undefined, this.regionCode)
    }

    public async getInstanceStatus(instanceId: string): Promise<EC2.InstanceStateName> {
        const client = await this.createEc2SdkClient()
        const requester = async (request: EC2.DescribeInstanceStatusRequest) =>
            client.describeInstanceStatus(request).promise()

        const response = await pageableToCollection(
            requester,
            { InstanceIds: [instanceId], IncludeAllInstances: true },
            'NextToken',
            'InstanceStatuses'
        )
            .flatten()
            .map(instanceStatus => instanceStatus!.InstanceState!.Name!)
            .promise()

        return response[0]
    }

    private async checkInstanceStatus(instanceId: string, targetStatus: EC2.InstanceStateName): Promise<boolean> {
        const status = await this.getInstanceStatus(instanceId)
        return status == targetStatus
    }

    protected async showError(errorName: Ec2ConnectErrorName, params: Ec2ConnectErrorParameters): Promise<string> {
        switch (errorName) {
            case "instanceStatus":
                return (await vscode.window.showErrorMessage(params.message))!
            case "permission":
                return (await showMessageWithUrl(params.message, params.url!, params.urlItem!, "error"))!
        }
    }

    public async handleStartSessionError(selection: Ec2Selection): Promise<string> {
        const isInstanceRunning = await this.checkInstanceStatus(selection.instanceId, 'running')
        const generalErrorMessage = `Unable to connect to target instance ${selection.instanceId} on region ${selection.region}. `

        if(isInstanceRunning){
            const errorParams: Ec2ConnectErrorParameters = {
                message: generalErrorMessage + "Please ensure the IAM role attached to the instance has the proper policies.", 
                url: 'https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-getting-started-instance-profile.html',
                urlItem: 'Configure IAM role'
            }
            return await this.showError('permission', errorParams)
        } else {
            const errorParams: Ec2ConnectErrorParameters = {
                message: generalErrorMessage + "Please ensure the target instance is running and not currently starting, stopping, or stopped."
            }
            return await this.showError('instanceStatus', errorParams)
        }
    }

    private async terminateSession(
        session: Session
    ): Promise<void | PromiseResult<SSM.TerminateSessionResponse, AWSError>> {
        const sessionId = session.SessionId!
        const ssmClient = await this.createSsmSdkClient()
        const termination = await ssmClient
            .terminateSession({ SessionId: sessionId })
            .promise()
            .catch(err => {
                getLogger().warn(`ec2: failed to terminate session "${sessionId}": %s`, err)
            })
        return termination
    }

    private async openSessionInTerminal(session: Session, selection: Ec2Selection) {
        const ssmPlugin = await getOrInstallCli('session-manager-plugin', !isCloud9)
        const shellArgs = [JSON.stringify(session), selection.region, 'StartSession']

        try {
            await withoutShellIntegration(() => {
                const Ec2Terminal = vscode.window.createTerminal({
                    name: selection.region + '/' + selection.instanceId,
                    shellPath: ssmPlugin,
                    shellArgs: shellArgs,
                })

                const listener = vscode.window.onDidCloseTerminal(terminal => {
                    if (terminal.processId === Ec2Terminal.processId) {
                        vscode.Disposable.from(listener, { dispose: () => this.terminateSession(session) }).dispose()
                    }
                })

                Ec2Terminal.show()
            })
        } catch (err) {
            throw ToolkitError.chain(err, 'Failed to open ec2 instance.')
        }
    }

    public async attemptEc2Connection(selection: Ec2Selection): Promise<void> {
        const ssmClient = await this.createSsmSdkClient()
        ssmClient.startSession({ Target: selection.instanceId }, async (err, data) => {
            if (err) {
                await this.handleStartSessionError(selection)
            } else {
                this.openSessionInTerminal(data, selection)
            }
        })
    }

    public async getInstanceIds(): Promise<AsyncCollection<string>> {
        const client = await this.createEc2SdkClient()
        return getInstanceIdsFromClient(client)
    }
}
