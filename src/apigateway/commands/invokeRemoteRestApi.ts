/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { RestApiNode } from '../explorer/apiNodes'
import { getLogger, Logger } from '../../shared/logger'
import { BaseTemplates } from '../../shared/templates/baseTemplates'
import { ext } from '../../shared/extensionGlobals'
import _ = require('lodash')
import { toArrayAsync, toMap } from '../../shared/utilities/collectionUtils'
import { ExtensionUtilities } from '../../shared/extensionUtilities'
import { ApigTemplates } from '../templates/apigTemplates'
import { Resource } from 'aws-sdk/clients/apigateway'
import { ApiGatewayClient } from '../../shared/clients/apiGatewayClient'

export async function invokeRemoteRestApi(params: { outputChannel: vscode.OutputChannel; apiNode: RestApiNode }) {
    const logger: Logger = getLogger()
    const apiNode = params.apiNode

    try {
        const view = vscode.window.createWebviewPanel(
            'html',
            `Invoke methods for ${apiNode.name}`,
            vscode.ViewColumn.One,
            {
                // Enable scripts in the webview
                enableScripts: true,
            }
        )
        const baseTemplateFn = _.template(BaseTemplates.SIMPLE_HTML)

        view.webview.html = baseTemplateFn({
            cspSource: view.webview.cspSource,
            content: '<h1>Loading...</h1>',
        })

        const invokeTemplateFn = _.template(ApigTemplates.REMOTE_INVOKE_TEMPLATE)

        const client = ext.toolkitClientBuilder.createApiGatewayClient(params.apiNode.regionCode)
        logger.info(`Loading API Resources for API ${apiNode.name} (id: ${apiNode.id})`)

        try {
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
                    Resources: new Map([...resources].sort(sortResources)),
                    Scripts: loadScripts,
                    Libraries: loadLibs,
                }),
            })
            view.webview.onDidReceiveMessage(
                createMessageReceivedFunc({
                    api: apiNode,
                    resources: resources,
                    client: client,
                    outputChannel: params.outputChannel,
                    onPostMessage: message => view.webview.postMessage(message),
                }),
                undefined,
                ext.context.subscriptions
            )
        } catch (err) {
            logger.error('Error getting resources: %O', err as Error)
        }
    } catch (err) {
        logger.error(err as Error)
    }
}

interface CommandMessage {
    command: string
    value?: string
    selectedApiResource?: string
    selectedMethod?: string
    queryString?: string
}

export function createMessageReceivedFunc({
    api,
    outputChannel,
    client,
    resources,
    ...restParams
}: {
    api: RestApiNode
    client: ApiGatewayClient
    outputChannel: vscode.OutputChannel
    resources: Map<string, Resource>
    onPostMessage(message: any): Thenable<boolean>
}) {
    const logger: Logger = getLogger()

    return async (message: CommandMessage) => {
        switch (message.command) {
            case 'apiResourceSelected': {
                const selectedResourceId = message.value
                if (!selectedResourceId) {
                    throw new Error(`Vue called 'apiResourceSelected', but no resourceId was provided!`)
                }
                logger.info(`Selected ${selectedResourceId}`)
                restParams.onPostMessage({
                    command: 'setMethods',
                    methods: listValidMethods(resources, selectedResourceId),
                })

                return
            }
            case 'invokeApi':
                if (!message.selectedApiResource) {
                    throw new Error('invokeApi called without providing an api resource')
                }
                if (!message.selectedMethod) {
                    throw new Error('invokeApi called without providing method')
                }
                if (!message.value) {
                    message.value = ''
                }

                restParams.onPostMessage({ command: 'invokeApiStarted' })

                logger.info('Invoking API Gateway resource:')
                logger.info(String(message.value))

                outputChannel.show()
                outputChannel.appendLine('Loading response...')

                const path = resources.get(message.selectedApiResource)?.path
                const pathWithQueryString = path && message.queryString ? `${path}?${message.queryString}` : undefined
                try {
                    const response = await client.testInvokeMethod(
                        api.id,
                        message.selectedApiResource,
                        message.selectedMethod,
                        message.value,
                        pathWithQueryString
                    )

                    outputChannel.appendLine(response.log!!)
                    outputChannel.appendLine('')
                    outputChannel.appendLine(`Request returned status: ${response.status}:`)
                    outputChannel.appendLine(response.body!!)
                } catch (e) {
                    const error = e as Error
                    outputChannel.appendLine(`There was an error invoking`)
                    outputChannel.appendLine(error.toString())
                    outputChannel.appendLine('')
                } finally {
                    restParams.onPostMessage({ command: 'invokeApiFinished' })
                }

                return
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

    // do some transforms because you can simultaneously declare a resource that supports ANY in conjunction with conventional methods
    const isAny = (method: string) => method.toUpperCase() === 'ANY'
    const methods = resource.resourceMethods !== undefined ? Object.keys(resource.resourceMethods) : []
    if (methods.find(isAny)) {
        methods.push(...supportedOperations)
    }

    return [...new Set(methods.filter(method => !isAny(method)))].sort()
}
