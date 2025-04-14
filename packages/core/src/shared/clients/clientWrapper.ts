/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import globals from '../extensionGlobals'
import { AwsClient, AwsClientConstructor, AwsCommand, AwsCommandConstructor } from '../awsClientBuilderV3'
import { PaginationConfiguration, Paginator } from '@aws-sdk/types'
import { AsyncCollection, toCollection } from '../utilities/asyncCollection'
import { hasKey, isDefined } from '../utilities/tsUtils'
import { PerfLog } from '../logger/perfLogger'
import { getLogger } from '../logger/logger'
import { truncateProps } from '../utilities/textUtilities'
import { ToolkitError } from '../errors'

type SDKPaginator<C, CommandInput extends object, CommandOutput extends object> = (
    config: Omit<PaginationConfiguration, 'client'> & { client: C },
    input: CommandInput,
    ...rest: any[]
) => Paginator<CommandOutput>

interface RequestOptions<Output extends object> {
    /**
     * Resolve this value if the request fails. If not present, will re-throw error.
     */
    fallbackValue?: Output
    /**
     * Do not used cached client for the request.
     */
    ignoreCache?: boolean
}
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

    protected async makeRequest<
        CommandInput extends object,
        CommandOutput extends object,
        CommandOptions extends CommandInput,
        Command extends AwsCommand<CommandInput, CommandOutput>,
    >(
        command: AwsCommandConstructor<CommandInput, Command>,
        commandOptions: CommandOptions,
        requestOptions?: RequestOptions<CommandOutput>
    ): Promise<CommandOutput> {
        const action = 'API Request'
        const perflog = new PerfLog(action)
        return await this.getClient(requestOptions?.ignoreCache)
            .send(new command(commandOptions))
            .catch(async (e) => {
                await this.onError(e)
                const errWithoutStack = { ...e, name: e.name, message: e.message }
                delete errWithoutStack['stack']
                const timecost = perflog.elapsed().toFixed(1)
                if (requestOptions?.fallbackValue) {
                    return requestOptions.fallbackValue
                }
                // Error is already logged in middleware before this, so we omit it here.
                getLogger().error(
                    `${action} failed without fallback (time: %dms) \nparams: %O`,
                    timecost,
                    truncateProps(commandOptions, 20, ['nextToken'])
                )
                throw new ToolkitError(`${action}: ${errWithoutStack.message}`, {
                    code: extractCode(errWithoutStack),
                    cause: errWithoutStack,
                })
            })
    }

    // Intended to be overwritten by subclasses to implement custom error handling behavior.
    protected onError(_: Error): void | Promise<void> {}

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

function extractCode(e: Error): string {
    return hasKey(e, 'code') && typeof e['code'] === 'string'
        ? e.code
        : hasKey(e, 'Code') && typeof e['Code'] === 'string'
          ? e.Code
          : e.name
}
