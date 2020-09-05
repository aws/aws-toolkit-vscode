/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { RestApiNode } from '../explorer/apiNodes'
import { getLogger, Logger } from '../../shared/logger'
import { BaseTemplates } from '../../shared/templates/baseTemplates'
import { ext } from '../../shared/extensionGlobals'
import { template } from 'lodash'
import { toArrayAsync, toMap } from '../../shared/utilities/collectionUtils'
import { ExtensionUtilities } from '../../shared/extensionUtilities'
import { Resource } from 'aws-sdk/clients/apigateway'
import { ApiGatewayClient } from '../../shared/clients/apiGatewayClient'
import { APIG_REMOTE_INVOKE_TEMPLATE } from '../templates/apigTemplates'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { recordApigatewayInvokeRemote, Result } from '../../shared/telemetry/telemetry'

// All the commands that we receive
interface Command {
    command: string
}

interface ApiSelectedMessage extends Command {
    value: string
}

interface InvokeApiMessage extends Command {
    body: string
    selectedApiResource: string
    selectedMethod: string
    queryString: string
}

function isApiSelectedMessage(command: Command): command is ApiSelectedMessage {
    return command.command === 'apiResourceSelected'
}

function isInvokeApiMessage(command: Command): command is InvokeApiMessage {
    return command.command === 'invokeApi'
}

export async function invokeRemoteRestApi(params: { outputChannel: vscode.OutputChannel; apiNode: RestApiNode }) {
    const logger: Logger = getLogger()
    const apiNode = params.apiNode

    try {
        const view = vscode.window.createWebviewPanel(
            'html',
            `Invoke methods on ${apiNode.name}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        )
        const baseTemplateFn = template(BaseTemplates.SIMPLE_HTML)

        view.webview.html = baseTemplateFn({
            cspSource: view.webview.cspSource,
            content: '<h1>Loading...</h1>',
        })

        const invokeTemplateFn = template(APIG_REMOTE_INVOKE_TEMPLATE)

        const client = ext.toolkitClientBuilder.createApiGatewayClient(params.apiNode.regionCode)
        logger.info(`Loading API Resources for API ${apiNode.name} (id: ${apiNode.id})`)

        const resources: Map<string, Resource> = toMap(
            await toArrayAsync(client.getResourcesForApi(apiNode.id)),
            resource => resource.id
        )

        logger.debug(`Loaded: ${resources}`)

        const loadScripts = ExtensionUtilities.getScriptsForHtml(['invokeRemoteRestApiVue.js'], view.webview)
        const loadLibs = ExtensionUtilities.getLibrariesForHtml(['vue.min.js'], view.webview)

        // something is wrong if the paths aren't defined...
        const sortResources = (a: [string, Resource], b: [string, Resource]) => a[1].path!.localeCompare(b[1].path!)

        view.webview.html = baseTemplateFn({
            cspSource: view.webview.cspSource,
            content: invokeTemplateFn({
                ApiName: apiNode.name,
                ApiId: apiNode.id,
                ApiArn: apiNode.arn,
                Resources: new Map([...resources].sort(sortResources)),
                Scripts: loadScripts,
                Libraries: loadLibs,
            }),
        })

        view.webview.postMessage({
            command: 'setLocalizedMessages',
            localizedMessages: {
                noApiResource: localize('AWS.apig.remoteInvoke.noApiResource', 'Select an API Resource'),
                noMethod: localize('AWS.apig.remoteInvoke.noMethod', 'Select a HTTP method'),
            },
        })

        view.webview.onDidReceiveMessage(
            createMessageReceivedFunc({
                api: apiNode,
                resources: resources,
                client: client,
                outputChannel: params.outputChannel,
                postMessage: message => view.webview.postMessage(message),
            }),
            undefined,
            ext.context.subscriptions
        )
    } catch (err) {
        logger.error(err as Error)
    }
}

export function createMessageReceivedFunc({
    api,
    client,
    outputChannel,
    resources,
    postMessage,
}: {
    api: RestApiNode
    client: ApiGatewayClient
    outputChannel: vscode.OutputChannel
    resources: Map<string, Resource>
    postMessage: (message: any) => Thenable<boolean>
}) {
    const logger: Logger = getLogger()
    let result: Result = 'Succeeded'

    return async (message: Command) => {
        if (isApiSelectedMessage(message)) {
            const selectedResourceId = message.value
            if (!selectedResourceId) {
                throw new Error(`Vue called 'apiResourceSelected', but no resourceId was provided!`)
            }
            logger.verbose(`Selected ${selectedResourceId}`)
            postMessage({
                command: 'setMethods',
                methods: listValidMethods(resources, selectedResourceId),
            })
        } else if (isInvokeApiMessage(message)) {
            postMessage({ command: 'invokeApiStarted' })

            logger.info('Invoking API Gateway resource:')
            logger.info(String(message.body))

            outputChannel.show()
            outputChannel.appendLine('Loading response...')

            const path = resources.get(message.selectedApiResource)?.path
            const pathWithQueryString = path && message.queryString ? `${path}?${message.queryString}` : undefined
            try {
                const response = await client.testInvokeMethod(
                    api.id,
                    message.selectedApiResource,
                    message.selectedMethod,
                    message.body,
                    pathWithQueryString
                )

                outputChannel.appendLine(response.log!!)
                outputChannel.appendLine('')
                outputChannel.appendLine(`Request returned status: ${response.status}:`)
                outputChannel.appendLine(response.body!!)
            } catch (e) {
                const error = e as Error
                result = 'Failed'
                outputChannel.appendLine(`There was an error invoking`)
                outputChannel.appendLine(error.toString())
                outputChannel.appendLine('')
            } finally {
                postMessage({ command: 'invokeApiFinished' })
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
}

export function listValidMethods(resources: Map<string, Resource>, resourceId: string): string[] {
    // OpenAPI 2 (swagger) valid methods
    const supportedOperations = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']
    const resource = resources.get(resourceId)
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
