/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { Session } from 'aws-sdk/clients/ssm'
import { Ec2Selection } from './utils'
import { getOrInstallCli } from '../shared/utilities/cliUtils'
import { isCloud9 } from '../shared/extensionUtilities'
import { withoutShellIntegration } from '../ecs/commands'
import { ToolkitError } from '../shared/errors'
import { DefaultSsmClient } from '../shared/clients/ssmClient'
import { showMessageWithUrl } from '../shared/utilities/messages'
import { DefaultEc2Client } from '../shared/clients/ec2Client'

export type Ec2ConnectErrorName = 'permission' | 'instanceStatus'
export interface Ec2ConnectErrorParameters {
    message: string
    url?: string
    urlItem?: string
}

export class Ec2ConnectClient {
    // Will need the ec2Client for probing errors,
    private ssmClient: DefaultSsmClient
    private ec2Client: DefaultEc2Client

    public constructor(readonly regionCode: string) {
        this.ssmClient = this.createSsmSdkClient()
        this.ec2Client = this.createEc2SdkClient()
    }

    protected createSsmSdkClient(): DefaultSsmClient {
        return new DefaultSsmClient(this.regionCode)
    }

    protected createEc2SdkClient(): DefaultEc2Client {
        return new DefaultEc2Client(this.regionCode)
    }

    protected async showError(errorName: Ec2ConnectErrorName, params: Ec2ConnectErrorParameters): Promise<string> {
        switch (errorName) {
            case 'instanceStatus':
                return (await vscode.window.showErrorMessage(params.message))!
            case 'permission':
                return (await showMessageWithUrl(params.message, params.url!, params.urlItem!, 'error'))!
        }
    }

    public async handleStartSessionError(selection: Ec2Selection): Promise<string> {
        const isInstanceRunning = await this.ec2Client.checkInstanceStatus(selection.instanceId, 'running')
        const generalErrorMessage = `Unable to connect to target instance ${selection.instanceId} on region ${selection.region}. `

        if (isInstanceRunning) {
            const errorParams: Ec2ConnectErrorParameters = {
                message:
                    generalErrorMessage +
                    'Please ensure the IAM role attached to the instance has the proper policies.',
                url: 'https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-getting-started-instance-profile.html',
                urlItem: 'Documentation To Configure IAM role',
            }
            return await this.showError('permission', errorParams)
        } else {
            const errorParams: Ec2ConnectErrorParameters = {
                message:
                    generalErrorMessage +
                    'Please ensure the target instance is running and not currently starting, stopping, or stopped.',
            }
            return await this.showError('instanceStatus', errorParams)
        }
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
                        vscode.Disposable.from(listener, {
                            dispose: () => this.ssmClient.terminateSession(session),
                        }).dispose()
                    }
                })

                Ec2Terminal.show()
            })
        } catch (err) {
            throw ToolkitError.chain(err, 'Failed to open ec2 instance.')
        }
    }

    public async attemptEc2Connection(selection: Ec2Selection): Promise<void> {
        await this.ssmClient.startSession(selection.instanceId, async (err, data) => {
            if (err) {
                // SSM SDK throws general error here, so no need to pass onward.
                await this.handleStartSessionError(selection)
            } else {
                this.openSessionInTerminal(data, selection)
            }
        })
    }
}
