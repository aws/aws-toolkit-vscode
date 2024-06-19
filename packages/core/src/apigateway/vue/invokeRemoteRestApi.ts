/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { RestApiNode } from '../explorer/apiNodes'
import { getLogger, Logger } from '../../shared/logger'

import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { Resource } from 'aws-sdk/clients/apigateway'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Result } from '../../shared/telemetry/telemetry'
import { VueWebview } from '../../webviews/main'
import { ExtContext } from '../../shared/extensions'
import { DefaultApiGatewayClient } from '../../shared/clients/apiGatewayClient'
import { telemetry } from '../../shared/telemetry/telemetry'

interface InvokeApiMessage {
    region: string
    body: string
    selectedApiResource: Resource
    selectedMethod: string
    queryString: string
    api: string
}

interface ResourceMap {
    [key: string]: Resource
}

export interface InvokeRemoteRestApiInitialData {
    ApiName: string
    ApiId: string
    ApiArn: string
    Resources: ResourceMap
    Region: string
    localizedMessages: {
        noApiResource: string
        noMethod: string
    }
}

export class RemoteRestInvokeWebview extends VueWebview {
    public static readonly sourcePath: string = 'src/apigateway/vue/index.js'
    public readonly id = 'remoteInvoke'

    private readonly logger = getLogger()

    public constructor(
        private readonly data: InvokeRemoteRestApiInitialData,
        private readonly channel: vscode.OutputChannel,
        private readonly client = new DefaultApiGatewayClient(data.Region)
    ) {
        super(RemoteRestInvokeWebview.sourcePath)
    }

    public init(): typeof this.data {
        return this.data
    }

    public listValidMethods(resource: Resource): string[] {
        return listValidMethods(resource)
    }

    public async invokeApi(message: InvokeApiMessage): Promise<string> {
        let result: Result = 'Succeeded'

        this.logger.info('Invoking API Gateway resource:')
        this.logger.info(String(message.body))

        this.channel.show()
        this.channel.appendLine('Loading response...')

        const path = message.selectedApiResource.path
        const pathWithQueryString = path && message.queryString ? `${path}?${message.queryString}` : undefined
        try {
            const response = await this.client.testInvokeMethod(
                message.api,
                message.selectedApiResource.id!,
                message.selectedMethod,
                message.body,
                pathWithQueryString
            )

            this.channel.appendLine(response.log!)
            this.channel.appendLine('')
            this.channel.appendLine(`Request returned status: ${response.status}:`)
            this.channel.appendLine(response.body!)
        } catch (e) {
            const error = e as Error
            result = 'Failed'
            this.channel.appendLine(`There was an error invoking`)
            this.channel.appendLine(error.toString())
            this.channel.appendLine('')
        } finally {
            // only set method if it is not empty or undefined
            const method = message.selectedMethod ? message.selectedMethod.toUpperCase() : undefined
            telemetry.apigateway_invokeRemote.emit({
                result: result,
                httpMethod: method,
            })
        }

        return result
    }
}

const Panel = VueWebview.compilePanel(RemoteRestInvokeWebview)

export async function invokeRemoteRestApi(
    context: ExtContext,
    params: { outputChannel: vscode.OutputChannel; apiNode: RestApiNode }
): Promise<void> {
    const logger: Logger = getLogger()

    try {
        const client = new DefaultApiGatewayClient(params.apiNode.regionCode)
        logger.info(`Loading API Resources for API ${params.apiNode.name} (id: ${params.apiNode.id})`)
        const resources = (await toArrayAsync(client.getResourcesForApi(params.apiNode.id)))
            .sort((a, b) => a.path!.localeCompare(b.path!))
            .reduce<{ [key: string]: Resource }>((prev, curr) => {
                return {
                    ...prev,
                    [curr.id!]: curr,
                }
            }, {})
        logger.debug(`Loaded: %O`, resources)

        // something is wrong if the paths aren't defined...
        // const sortResources = (a: [string, Resource], b: [string, Resource]) => a[1].path!.localeCompare(b[1].path!)
        const wv = new Panel(
            context.extensionContext,
            {
                ApiName: params.apiNode.name,
                ApiId: params.apiNode.id,
                ApiArn: params.apiNode.arn,
                Resources: resources,
                Region: params.apiNode.regionCode,
                localizedMessages: {
                    noApiResource: localize('AWS.apig.remoteInvoke.noApiResource', 'Select an API Resource'),
                    noMethod: localize('AWS.apig.remoteInvoke.noMethod', 'Select a HTTP method'),
                },
            },
            context.outputChannel
        )

        await wv.show({ title: localize('AWS.invokeApi.title', 'Invoke Remote API') })
    } catch (err) {
        logger.error(err as Error)
    }
}

export function listValidMethods(resource: Resource): string[] {
    // OpenAPI 2 (swagger) valid methods
    const supportedOperations = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']

    // you can simultaneously declare a resource that supports ANY in conjunction with conventional methods
    const isAny = (method: string) => method.toUpperCase() === 'ANY'
    const methods = resource.resourceMethods !== undefined ? Object.keys(resource.resourceMethods) : []
    if (methods.some(isAny)) {
        return supportedOperations
    }

    return methods.sort()
}
