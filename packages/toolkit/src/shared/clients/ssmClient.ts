/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSError, SSM } from 'aws-sdk'
import { getLogger } from '../logger/logger'
import globals from '../extensionGlobals'
import { pageableToCollection } from '../utilities/collectionUtils'
import { PromiseResult } from 'aws-sdk/lib/request'
import { ToolkitError } from '../errors'

export class SsmClient {
    public constructor(public readonly regionCode: string) {}

    private async createSdkClient(): Promise<SSM> {
        return await globals.sdkClientBuilder.createAwsService(SSM, undefined, this.regionCode)
    }

    public async terminateSession(session: SSM.Session): Promise<SSM.TerminateSessionResponse> {
        const sessionId = session.SessionId!
        const client = await this.createSdkClient()
        const termination = await client
            .terminateSession({ SessionId: sessionId })
            .promise()
            .catch(err => {
                getLogger().warn(`ssm: failed to terminate session "${sessionId}": %s`, err)
            })

        return termination!
    }

    public async startSession(
        target: string,
        document?: string,
        parameters?: SSM.SessionManagerParameters
    ): Promise<SSM.StartSessionResponse> {
        const client = await this.createSdkClient()
        const response = await client
            .startSession({ Target: target, DocumentName: document, Parameters: parameters })
            .promise()
        return response
    }

    public async describeInstance(target: string): Promise<SSM.InstanceInformation> {
        const client = await this.createSdkClient()
        const requester = async (req: SSM.DescribeInstanceInformationRequest) =>
            client.describeInstanceInformation(req).promise()
        const request: SSM.DescribeInstanceInformationRequest = {
            InstanceInformationFilterList: [
                {
                    key: 'InstanceIds',
                    valueSet: [target],
                },
            ],
        }

        const response = await pageableToCollection(requester, request, 'NextToken', 'InstanceInformationList')
            .flatten()
            .flatten()
            .promise()
        return response[0]!
    }

    public async getTargetPlatformName(target: string): Promise<string> {
        const instanceInformation = await this.describeInstance(target)

        return instanceInformation.PlatformName!
    }

    public async sendCommand(
        target: string,
        documentName: string,
        parameters: SSM.Parameters
    ): Promise<SSM.SendCommandResult> {
        const client = await this.createSdkClient()
        const response = await client
            .sendCommand({ InstanceIds: [target], DocumentName: documentName, Parameters: parameters })
            .promise()
        return response
    }

    public async sendCommandAndWait(
        target: string,
        documentName: string,
        parameters: SSM.Parameters
    ): Promise<PromiseResult<SSM.GetCommandInvocationResult, AWSError>> {
        const response = await this.sendCommand(target, documentName, parameters)
        const client = await this.createSdkClient()
        try {
            const commandId = response.Command!.CommandId!
            const result = await client
                .waitFor('commandExecuted', { CommandId: commandId, InstanceId: target })
                .promise()
            return result
        } catch (err) {
            throw new ToolkitError(`Failed in sending command to target ${target}`, { cause: err as Error })
        }
    }

    public async getInstanceAgentPingStatus(target: string): Promise<string> {
        const instanceInformation = await this.describeInstance(target)
        return instanceInformation ? instanceInformation.PingStatus! : 'Inactive'
    }
}
