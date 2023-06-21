/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { Session } from 'aws-sdk/clients/ssm'
import { Ec2Selection } from './utils'
import { getOrInstallCli } from '../shared/utilities/cliUtils'
import { isCloud9 } from '../shared/extensionUtilities'
import { ToolkitError, isAwsError } from '../shared/errors'
import { SsmClient } from '../shared/clients/ssmClient'
import { openRemoteTerminal } from '../shared/remoteSession'

export class Ec2ConnectionManager {
    // Will need the ec2Client for probing errors,
    private ssmClient: SsmClient
    //private ec2Client: DefaultEc2Client

    public constructor(readonly regionCode: string) {
        this.ssmClient = new SsmClient(this.regionCode)
        //this.ec2Client = new DefaultEc2Client(this.regionCode)
    }

    private async handleStartSessionError(err: AWS.AWSError): Promise<void> {
        const failureMessage =
            "SSM: Failed to start session with target instance. Common reasons include: \n 1. SSM Agent not installed on instance. \n 2. The required IAM instance profile isn't attached to the instance.  \n 3. Session manager setup is incomplete."
        await vscode.window.showErrorMessage(failureMessage)

        throw new ToolkitError('Start Session Failed. ')
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
                await this.handleStartSessionError(err)
            } else {
                throw err
            }
        }
    }
}
