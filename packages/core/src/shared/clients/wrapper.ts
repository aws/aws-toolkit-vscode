/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import globals from '../extensionGlobals'
import { AwsClient, AwsClientConstructor } from '../awsClientBuilderV3'
import { pageableToCollection } from '../utilities/collectionUtils'

export abstract class ClientWrapper<C extends AwsClient> implements vscode.Disposable {
    protected client: C | undefined

    public constructor(
        public readonly regionCode: string,
        private readonly clientType: AwsClientConstructor<any>
    ) {}

    protected async getClient() {
        if (this.client) {
            return this.client
        }
        this.client = await globals.sdkClientBuilderV3.createAwsService(this.clientType, undefined, this.regionCode)
        return this.client!
    }

    protected async makeRequest<CommandInput extends object, Command extends object>(
        command: new (o: CommandInput) => Command,
        commandOptions: CommandInput
    ) {
        const client = await this.getClient()
        return await client.send(new command(commandOptions))
    }

    protected makePaginatedRequest<CommandInput extends object, CommandOutput extends object, Command extends object>(
        command: new (o: CommandInput) => Command,
        commandOptions: CommandInput,
        collectKey: keyof CommandOutput & string,
        nextTokenKey?: keyof CommandOutput & keyof CommandInput & string
    ) {
        const requester = async (req: CommandInput) => await this.makeRequest(command, req)
        const response = pageableToCollection(
            requester,
            commandOptions,
            nextTokenKey ?? ('NextToken' as never),
            collectKey
        )
        return response
    }

    public dispose() {
        this.client?.destroy()
    }
}
