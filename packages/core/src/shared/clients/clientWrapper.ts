/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import globals from '../extensionGlobals'
import { AwsClient, AwsClientConstructor, AwsCommand } from '../awsClientBuilderV3'
import { pageableToCollection } from '../utilities/collectionUtils'

export abstract class ClientWrapper<C extends AwsClient> implements vscode.Disposable {
    protected client?: C

    public constructor(
        public readonly regionCode: string,
        private readonly clientType: AwsClientConstructor<C>
    ) {}

    protected async getClient(noCache: boolean = false) {
        if (noCache) {
            return await globals.sdkClientBuilderV3.createAwsService(this.clientType, undefined, this.regionCode)
        }
        return await globals.sdkClientBuilderV3.getAwsService(this.clientType, undefined, this.regionCode)
    }

    protected async makeRequest<CommandInput extends object, Command extends AwsCommand>(
        command: new (o: CommandInput) => Command,
        commandOptions: CommandInput
    ) {
        const client = await this.getClient()
        return await client.send(new command(commandOptions))
    }

    protected makePaginatedRequest<
        CommandInput extends object,
        CommandOutput extends object,
        Command extends AwsCommand,
    >(
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
