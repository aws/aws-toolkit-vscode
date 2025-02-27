/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    SSMClient,
    Session,
    StartSessionCommand,
    TerminateSessionCommand,
    TerminateSessionResponse,
    StartSessionCommandOutput,
    DescribeInstanceInformationCommandInput,
    InstanceInformation,
    SendCommandCommand,
    SendCommandCommandOutput,
    waitUntilCommandExecuted,
    SessionState,
    paginateDescribeInstanceInformation,
    paginateDescribeSessions,
} from '@aws-sdk/client-ssm'
import { WaiterState } from '@smithy/util-waiter'
import { ToolkitError } from '../errors'
import { ClientWrapper } from './clientWrapper'

export class SsmClient extends ClientWrapper<SSMClient> {
    public constructor(public override readonly regionCode: string) {
        super(regionCode, SSMClient)
    }

    public async terminateSession(session: Session): Promise<TerminateSessionResponse> {
        const sessionId = session.SessionId!
        return await this.terminateSessionFromId(sessionId)
    }

    public async terminateSessionFromId(sessionId: string): Promise<TerminateSessionResponse> {
        return await this.makeRequest(TerminateSessionCommand, { SessionId: sessionId })
    }

    public async startSession(
        target: string,
        document?: string,
        reason?: string,
        parameters?: Record<string, string[]>
    ): Promise<StartSessionCommandOutput> {
        return await this.makeRequest(StartSessionCommand, {
            Target: target,
            DocumentName: document,
            Reason: reason,
            Parameters: parameters,
        })
    }

    public async describeInstance(target: string): Promise<InstanceInformation> {
        return await this.getFirstResult(
            paginateDescribeInstanceInformation,
            {
                InstanceInformationFilterList: [{ key: 'InstanceIds', valueSet: [target] }],
            } satisfies DescribeInstanceInformationCommandInput,
            (page) => page.InstanceInformationList
        )
    }

    public async getTargetPlatformName(target: string): Promise<string> {
        const instanceInformation = await this.describeInstance(target)
        return instanceInformation.PlatformName!
    }

    public async sendCommand(
        target: string,
        documentName: string,
        parameters: Record<string, string[]>
    ): Promise<SendCommandCommandOutput> {
        return await this.makeRequest(SendCommandCommand, {
            InstanceIds: [target],
            DocumentName: documentName,
            Parameters: parameters,
        })
    }

    private async waitForCommand(commandId: string, target: string) {
        const result = await waitUntilCommandExecuted(
            { client: this.getClient(), maxWaitTime: 30 },
            { CommandId: commandId, InstanceId: target }
        )
        if (result.state !== WaiterState.SUCCESS) {
            throw new ToolkitError(`Command ${commandId} failed to execute on target ${target}`)
        }
    }

    public async sendCommandAndWait(
        target: string,
        documentName: string,
        parameters: Record<string, string[]>
    ): Promise<SendCommandCommandOutput> {
        const response = await this.sendCommand(target, documentName, parameters)
        try {
            await this.waitForCommand(response.Command!.CommandId!, target)
            return response
        } catch (err) {
            throw new ToolkitError(`Failed in sending command to target ${target}`, { cause: err as Error })
        }
    }

    public async getInstanceAgentPingStatus(target: string): Promise<string> {
        const instanceInformation = await this.describeInstance(target)
        return instanceInformation ? instanceInformation.PingStatus! : 'Inactive'
    }

    public async describeSessions(state: SessionState) {
        return this.makePaginatedRequest(paginateDescribeSessions, { State: state }, (page) => page.Sessions)
    }
}
