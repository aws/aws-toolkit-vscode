/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { EC2, SSM } from "aws-sdk";
import globals from "../shared/extensionGlobals";
import { Session } from 'aws-sdk/clients/ssm'
import { Ec2Selection, getInstanceIdsFromClient } from "./utils";
import { getOrInstallCli } from "../shared/utilities/cliUtils";
import { isCloud9 } from "../shared/extensionUtilities";
import { withoutShellIntegration } from "../ecs/commands";
import { ToolkitError } from '../shared/errors';
import { AsyncCollection } from '../shared/utilities/asyncCollection';

export class Ec2ConnectClient {
    public constructor(readonly regionCode: string) {
        
    }

    protected async createEc2SdkClient(): Promise<EC2> {
        return await globals.sdkClientBuilder.createAwsService(EC2, undefined, this.regionCode)
    }

    protected async createSsmSdkClient(): Promise<SSM> {
        return await globals.sdkClientBuilder.createAwsService(SSM, undefined, this.regionCode)
    }

    private handleStartSessionError(err: AWS.AWSError) {
        console.log(err)
    }

    private async openTerminal(session: Session, selection: Ec2Selection) {
        const ssmPlugin = await getOrInstallCli('session-manager-plugin', !isCloud9)
        const shellArgs = [JSON.stringify(session), selection.region, "StartSession"]

        try {
            await withoutShellIntegration(() => {
                const Ec2Terminal = vscode.window.createTerminal({
                    name: selection.region + "/" +selection.instanceId,
                    shellPath: ssmPlugin, 
                    shellArgs: shellArgs
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
                this.handleStartSessionError(err)
            } else {
                console.log("no error!")
                this.openTerminal(data, selection)
            }
        })
    }

    public async getInstanceIdsFromRegion(regionCode: string): Promise<AsyncCollection<string>> {
        const client = await this.createEc2SdkClient()
        return getInstanceIdsFromClient(client)
    }


}
