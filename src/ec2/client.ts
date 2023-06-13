/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { AWSError, EC2, SSM } from "aws-sdk";
import globals from "../shared/extensionGlobals";
import { Session } from 'aws-sdk/clients/ssm'
import { Ec2Selection, getInstanceIdsFromClient } from "./utils";
import { getOrInstallCli } from "../shared/utilities/cliUtils";
import { isCloud9 } from "../shared/extensionUtilities";
import { withoutShellIntegration } from "../ecs/commands";
import { ToolkitError } from '../shared/errors';
import { AsyncCollection } from '../shared/utilities/asyncCollection';
import { getLogger } from '../shared/logger';
import { PromiseResult } from 'aws-sdk/lib/request';

export class Ec2ConnectClient {
    public constructor(readonly regionCode: string) {
        
    }

    protected async createEc2SdkClient(): Promise<EC2> {
        return await globals.sdkClientBuilder.createAwsService(EC2, undefined, this.regionCode)
    }

    protected async createSsmSdkClient(): Promise<SSM> {
        return await globals.sdkClientBuilder.createAwsService(SSM, undefined, this.regionCode)
    }

    private async handleStartSessionError(err: AWS.AWSError): Promise<void> {
        const failureMessage = "SSM: Failed to start session with target instance. Common reasons include: \n 1. SSM Agent not installed on instance. \n 2. The required IAM instance profile isn't attached to the instance.  \n 3. Session manager setup is incomplete."
        await vscode.window.showErrorMessage(failureMessage)

        throw new ToolkitError('Start Session Failed. ')
    }

    private async terminateSession(session: Session): Promise<void | PromiseResult<SSM.TerminateSessionResponse, AWSError>>{
        const sessionId = session.SessionId!
        const ssmClient = await this.createSsmSdkClient()
        const termination = await ssmClient.terminateSession({ SessionId: sessionId})
            .promise() 
            .catch(err => {
                getLogger().warn(`ec2: failed to terminate session "${sessionId}": %s`, err)
            })
        return termination
    }

    private async openSessionInTerminal(session: Session, selection: Ec2Selection) {
        const ssmPlugin = await getOrInstallCli('session-manager-plugin', !isCloud9)
        const shellArgs = [JSON.stringify(session), selection.region, "StartSession"]

        try {
            await withoutShellIntegration(() => {
                const Ec2Terminal = vscode.window.createTerminal({
                    name: selection.region + "/" +selection.instanceId,
                    shellPath: ssmPlugin, 
                    shellArgs: shellArgs
                })

                const listener = vscode.window.onDidCloseTerminal(terminal => {
                    if (terminal.processId === Ec2Terminal.processId) {
                        vscode.Disposable.from(listener, {dispose: () => this.terminateSession(session)})
                            .dispose()
                    }
                })

                Ec2Terminal.show()
            })
        } catch (err) {
            throw ToolkitError.chain(err, "Failed to open ec2 instance.")
        }
    }

    public async attemptEc2Connection(selection: Ec2Selection): Promise<void> {
        const ssmClient = await this.createSsmSdkClient()
        ssmClient.startSession({Target: selection.instanceId}, async (err, data) => {
            if(err) {
                await this.handleStartSessionError(err)
            } else {
                console.log("no error!")
                this.openSessionInTerminal(data, selection)
            }
        })
    }

    public async getInstanceIds(): Promise<AsyncCollection<string>> {
        const client = await this.createEc2SdkClient()
        return getInstanceIdsFromClient(client)
    }


}
