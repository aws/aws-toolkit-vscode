/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { RestApiNode } from '../explorer/apiNodes'
import { getLogger, Logger } from '../../shared/logger'

// import { template } from 'lodash'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { Resource } from 'aws-sdk/clients/apigateway'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { recordApigatewayInvokeRemote, Result } from '../../shared/telemetry/telemetry'
import globals from '../../shared/extensionGlobals'
import { compileVueWebview } from '../../webviews/main'
import { ExtContext } from '../../shared/extensions'
import { WebviewServer } from '../../webviews/server'

// All the commands that we receive
interface Command {
    command: string
    region: string
}

interface ApiSelectedMessage extends Command {
    resource: Resource
}

interface InvokeApiMessage extends Command {
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

function isApiSelectedMessage(command: Command): command is ApiSelectedMessage {
    return command.command === 'apiResourceSelected'
}

function isInvokeApiMessage(command: Command): command is InvokeApiMessage {
    return command.command === 'invokeApi'
}

const VueWebview = compileVueWebview({
    id: 'remoteInvoke',
    title: localize('AWS.invokeApi.title', 'Invoke Remote API'), // TODO: Loc
    webviewJs: 'apigatewayVue.js',
    commands: {
        handler: function (message: Command | ApiSelectedMessage | InvokeApiMessage) {
            handleMessage(this, message)
        },
    },
    start: (init: InvokeRemoteRestApiInitialData) => init,
})
export class RemoteRestInvokeWebview extends VueWebview {}

export async function invokeRemoteRestApi(
    context: ExtContext,
    params: { outputChannel: vscode.OutputChannel; apiNode: RestApiNode }
): Promise<void> {
    const logger: Logger = getLogger()
    const wv = new RemoteRestInvokeWebview(context)

    try {
        const client = globals.toolkitClientBuilder.createApiGatewayClient(params.apiNode.regionCode)
        logger.info(`Loading API Resources for API ${params.apiNode.name} (id: ${params.apiNode.id})`)
        const resources = (await toArrayAsync(client.getResourcesForApi(params.apiNode.id)))
            .sort((a, b) => a.path!.localeCompare(b.path!))
            .reduce<{ [key: string]: Resource }>((prev, curr) => {
                return {
                    ...prev,
                    [curr.id!]: curr,
                }
            }, {})
        logger.debug(`Loaded: ${resources}`)

        // something is wrong if the paths aren't defined...
        // const sortResources = (a: [string, Resource], b: [string, Resource]) => a[1].path!.localeCompare(b[1].path!)

        await wv.start({
            ApiName: params.apiNode.name,
            ApiId: params.apiNode.id,
            ApiArn: params.apiNode.arn,
            Resources: resources,
            Region: params.apiNode.regionCode,
            localizedMessages: {
                noApiResource: localize('AWS.apig.remoteInvoke.noApiResource', 'Select an API Resource'),
                noMethod: localize('AWS.apig.remoteInvoke.noMethod', 'Select a HTTP method'),
            },
        })
    } catch (err) {
        logger.error(err as Error)
    }
}

export function listValidMethods(resource: Resource): string[] {
    // OpenAPI 2 (swagger) valid methods
    const supportedOperations = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']
    if (resource === undefined) {
        throw new Error('Resource not defined')
    }

    // you can simultaneously declare a resource that supports ANY in conjunction with conventional methods
    const isAny = (method: string) => method.toUpperCase() === 'ANY'
    const methods = resource.resourceMethods !== undefined ? Object.keys(resource.resourceMethods) : []
    if (methods.find(isAny)) {
        return supportedOperations
    }

    return methods.sort()
}

async function handleMessage(server: WebviewServer, message: Command): Promise<void> {
    const logger: Logger = getLogger()
    let result: Result = 'Succeeded'
    logger.info(message.toString())
    const client = globals.toolkitClientBuilder.createApiGatewayClient(message.region)

    if (isApiSelectedMessage(message)) {
        const selectedResourceId = message.resource
        if (!selectedResourceId) {
            throw new Error(`Vue called 'apiResourceSelected', but no resource was provided!`)
        }
        logger.verbose(`Selected ${selectedResourceId}`)
        server.postMessage({
            command: 'setMethods',
            methods: listValidMethods(message.resource),
        })
    } else if (isInvokeApiMessage(message)) {
        server.postMessage({ command: 'invokeApiStarted' })

        logger.info('Invoking API Gateway resource:')
        logger.info(String(message.body))

        server.context.invokeOutputChannel.show()
        server.context.invokeOutputChannel.appendLine('Loading response...')

        const path = message.selectedApiResource.path
        const pathWithQueryString = path && message.queryString ? `${path}?${message.queryString}` : undefined
        try {
            const response = await client.testInvokeMethod(
                message.api,
                message.selectedApiResource.id!,
                message.selectedMethod,
                message.body,
                pathWithQueryString
            )

            server.context.invokeOutputChannel.appendLine(response.log!)
            server.context.invokeOutputChannel.appendLine('')
            server.context.invokeOutputChannel.appendLine(`Request returned status: ${response.status}:`)
            server.context.invokeOutputChannel.appendLine(response.body!)
        } catch (e) {
            const error = e as Error
            result = 'Failed'
            server.context.invokeOutputChannel.appendLine(`There was an error invoking`)
            server.context.invokeOutputChannel.appendLine(error.toString())
            server.context.invokeOutputChannel.appendLine('')
        } finally {
            server.postMessage({ command: 'invokeApiFinished' })
            // only set method if it is not empty or undefined
            const method = message.selectedMethod ? message.selectedMethod.toUpperCase() : undefined
            recordApigatewayInvokeRemote({
                result: result,
                httpMethod: method,
            })
        }
    } else {
        throw new Error(`Received unknown message: ${message.command}\n${JSON.stringify(message)}`)
    }
}
