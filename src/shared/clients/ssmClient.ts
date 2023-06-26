/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    SSM,
    InstanceInformation,
    Session,
    TerminateSessionResponse,
    StartSessionResponse,
    DescribeInstanceInformationRequest,
} from '@aws-sdk/client-ssm'
import { getLogger } from '../logger/logger'
import { pageableToCollection } from '../utilities/collectionUtils'

export class SsmClient {
    public constructor(public readonly regionCode: string) {}

    private async createSdkClient(): Promise<SSM> {
        return new SSM({ region: this.regionCode })
    }

    public async terminateSession(session: Session): Promise<TerminateSessionResponse> {
        const sessionId = session.SessionId!
        const client = await this.createSdkClient()
        const termination = await client.terminateSession({ SessionId: sessionId }).catch(err => {
            getLogger().warn(`ssm: failed to terminate session "${sessionId}": %s`, err)
        })

        return termination!
    }

    public async startSession(target: string): Promise<StartSessionResponse> {
        const client = await this.createSdkClient()
        const response = await client.startSession({ Target: target })
        return response
    }

    public async describeInstanceInformation(target: string): Promise<InstanceInformation> {
        const client = await this.createSdkClient()
        const requester = async (req: DescribeInstanceInformationRequest) => client.describeInstanceInformation(req)
        const request: DescribeInstanceInformationRequest = {
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

    public async getInstancePingStatus(target: string): Promise<string> {
        const instanceInformation = await this.describeInstanceInformation(target)
        return instanceInformation ? instanceInformation.PingStatus! : 'Inactive'
    }
}
