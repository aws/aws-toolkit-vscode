/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import globals from '../extensionGlobals'
import { AwsClient, AwsClientConstructor, AwsCommand, AwsCommandConstructor } from '../awsClientBuilderV3'
import { PaginationConfiguration, Paginator } from '@aws-sdk/types'
import { AsyncCollection, toCollection } from '../utilities/asyncCollection'

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

    protected getClient(ignoreCache: boolean = false) {
        const args = { serviceClient: this.clientType, region: this.regionCode }
        return ignoreCache
            ? globals.sdkClientBuilderV3.createAwsService(args)
            : globals.sdkClientBuilderV3.getAwsService(args)
    }

    protected async makeRequest<CommandInput extends object, CommandOutput extends object, Command extends AwsCommand>(
        command: AwsCommandConstructor<CommandInput, Command>,
        commandOptions: CommandInput
    ): Promise<CommandOutput> {
        return await this.getClient().send(new command(commandOptions))
    }

    protected makePaginatedRequest<CommandInput extends object, CommandOutput extends object, Output extends object>(
        paginator: SDKPaginator<C, CommandInput, CommandOutput>,
        input: CommandInput,
        extractPage: (page: CommandOutput) => Output[] | undefined
    ): AsyncCollection<Output[]> {
        const p = paginator({ client: this.getClient() }, input)
        const collection = toCollection(() => p)
            .map(extractPage)
            .filter(isDefined)
            .map((o) => o.filter(isDefined))

        return collection

        function isDefined<T>(i: T | undefined): i is T {
            return i !== undefined
        }
    }

    protected async getFirst<CommandInput extends object, CommandOutput extends object, Output extends object>(
        paginator: SDKPaginator<C, CommandInput, CommandOutput>,
        input: CommandInput,
        extractPage: (page: CommandOutput) => Output[] | undefined
    ): Promise<Output> {
        const results = await this.makePaginatedRequest(paginator, input, extractPage).flatten().promise()
        return results[0]
    }

    public dispose() {
        this.client?.destroy()
    }
}
