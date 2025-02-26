/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import globals from '../extensionGlobals'
import { AwsClient, AwsClientConstructor, AwsCommand } from '../awsClientBuilderV3'
import { PaginationConfiguration, Paginator } from '@aws-sdk/types'

type SDKPaginator<C, CommandInput extends object, CommandOutput extends object> = (
    config: Omit<PaginationConfiguration, 'client'> & { client: C },
    input: CommandInput,
    ...rest: any[]
) => Paginator<CommandOutput>
export abstract class ClientWrapper<C extends AwsClient> implements vscode.Disposable {
    protected client?: C

    public constructor(
        public readonly regionCode: string,
        private readonly clientType: AwsClientConstructor<C>
    ) {}

    protected async getClient(ignoreCache: boolean = false) {
        const args = { serviceClient: this.clientType, region: this.regionCode }
        return ignoreCache
            ? await globals.sdkClientBuilderV3.createAwsService(args)
            : await globals.sdkClientBuilderV3.getAwsService(args)
    }

    protected async makeRequest<CommandInput extends object, Command extends AwsCommand>(
        command: new (o: CommandInput) => Command,
        commandOptions: CommandInput
    ) {
        const client = await this.getClient()
        return await client.send(new command(commandOptions))
    }

    protected async makePaginatedRequest<
        CommandInput extends object,
        CommandOutput extends object,
        Output extends object,
    >(
        paginator: SDKPaginator<C, CommandInput, CommandOutput>,
        input: CommandInput,
        extractPage: (page: CommandOutput) => Output[] | undefined
    ): Promise<Output[]> {
        const p = paginator({ client: await this.getClient() }, input)
        const results = []
        for await (const page of p) {
            results.push(extractPage(page))
        }
        const filteredResult = results.flat().filter((result) => result !== undefined) as Output[]
        return filteredResult
    }

    public dispose() {
        this.client?.destroy()
    }
}
