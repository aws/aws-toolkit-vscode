/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { _Blob } from 'aws-sdk/clients/lambda'
import { readFileSync } from 'fs'
import * as _ from 'lodash'
import * as vscode from 'vscode'
import { LambdaClient } from '../../shared/clients/lambdaClient'
import globals from '../../shared/extensionGlobals'
import { ExtContext } from '../../shared/extensions'

import { getLogger, Logger } from '../../shared/logger'
import { HttpResourceFetcher } from '../../shared/resourcefetcher/httpResourceFetcher'
import { compileVueWebview } from '../../webviews/main'
import { sampleRequestPath } from '../constants'
import { LambdaFunctionNode } from '../explorer/lambdaFunctionNode'
import { getSampleLambdaPayloads, SampleRequest } from '../utils'

import * as nls from 'vscode-nls'
import { WebviewServer } from '../../webviews/server'
const localize = nls.loadMessageBundle()

export interface CommandMessage {
    command: string
}

interface SampleRequestSelectedMessage extends CommandMessage {
    requestName: string
}

interface InvokeLambdaMessage extends CommandMessage {
    json: string
    functionName: string
    functionArn: string
    region: string
}

interface PromptFileMessage extends CommandMessage {}

export interface InitialData {
    FunctionName: string
    FunctionArn: string
    FunctionRegion: string
    InputSamples: SampleRequest[]
}

function isSampleRequestSelectedMessage(message: CommandMessage): message is SampleRequestSelectedMessage {
    return message.command === 'sampleRequestSelected'
}

function isInvokeLambdaMessage(message: CommandMessage): message is InvokeLambdaMessage {
    return message.command === 'invokeLambda'
}

function isPromptFileMessage(message: CommandMessage): message is PromptFileMessage {
    return message.command === 'promptForFile'
}

export interface RemoteInvokeData {
    initialData: InitialData
    selectedSampleRequest: string
    sampleText: string
    error?: Error
    payload: any
    statusCode: string
    logs: string
    showResponse: boolean
    isLoading: boolean
    selectedFile: string
}

const VueWebview = compileVueWebview({
    id: 'remoteInvoke',
    title: localize('AWS.invokeLambda.title', 'Invoke Lambda'), // TODO: set Lambda name in title: need a proper constructor
    webviewJs: 'lambdaRemoteInvokeVue.js',
    commands: {
        handler: function (message: CommandMessage | SampleRequestSelectedMessage | InvokeLambdaMessage) {
            handleMessage(this, message)
        },
    },
    start: (init: InitialData) => init,
})
export class RemoteInvokeWebview extends VueWebview {}

export async function invokeRemoteLambda(
    context: ExtContext,
    params: {
        /* TODO: Instead of vague scope-leaking objects: awsContext & element, it would be cleaner if this took:
         *  {
         *      lambdaClient: LambdaClient,         // or just invoke/invokeAsync interface of AWS.Lambda (see: lambda.d.ts)
         *      invokeParams: {functionArn: string} // or Lambda.Types.InvocationRequest (see: lambda.d.ts)
         *  }
         */
        outputChannel: vscode.OutputChannel
        functionNode: LambdaFunctionNode
    }
) {
    const inputs = await getSampleLambdaPayloads()

    const wv = new RemoteInvokeWebview(context)
    await wv.start({
        FunctionName: params.functionNode.configuration.FunctionName ?? '',
        FunctionArn: params.functionNode.configuration.FunctionArn ?? '',
        FunctionRegion: params.functionNode.regionCode,
        InputSamples: inputs,
    })
}

async function handleMessage(server: WebviewServer, message: CommandMessage) {
    const logger: Logger = getLogger()
    if (isSampleRequestSelectedMessage(message)) {
        logger.info(`Requesting ${message.requestName}`)
        const sampleUrl = `${sampleRequestPath}${message.requestName}`

        const sample = (await new HttpResourceFetcher(sampleUrl, { showUrl: true }).get()) ?? ''

        logger.debug(`Retrieved: ${sample}`)

        server.postMessage({ command: 'loadedSample', sample: sample, selectedFile: '' })

        return
    } else if (isInvokeLambdaMessage(message)) {
        logger.info('invoking lambda function with the following payload:')
        logger.info(message.json)

        server.context.invokeOutputChannel.show()
        server.context.invokeOutputChannel.appendLine('Loading response...')

        try {
            if (!message.functionArn) {
                throw new Error(`Could not determine ARN for function ${message.functionName}`)
            }
            const client: LambdaClient = globals.toolkitClientBuilder.createLambdaClient(message.region)
            const funcResponse = await client.invoke(message.functionArn, message.json)
            const logs = funcResponse.LogResult ? Buffer.from(funcResponse.LogResult, 'base64').toString() : ''
            const payload = funcResponse.Payload ? funcResponse.Payload : JSON.stringify({})

            server.context.invokeOutputChannel.appendLine(`Invocation result for ${message.functionArn}`)
            server.context.invokeOutputChannel.appendLine('Logs:')
            server.context.invokeOutputChannel.appendLine(logs)
            server.context.invokeOutputChannel.appendLine('')
            server.context.invokeOutputChannel.appendLine('Payload:')
            server.context.invokeOutputChannel.appendLine(payload.toString())
            server.context.invokeOutputChannel.appendLine('')
        } catch (e) {
            const error = e as Error
            server.context.invokeOutputChannel.appendLine(`There was an error invoking ${message.functionArn}`)
            server.context.invokeOutputChannel.appendLine(error.toString())
            server.context.invokeOutputChannel.appendLine('')
        }

        return
    } else if (isPromptFileMessage(message)) {
        const fileLocations = await vscode.window.showOpenDialog({
            openLabel: 'Open',
        })

        if (!fileLocations || fileLocations.length === 0) {
            return undefined
        }

        try {
            const fileContent = readFileSync(fileLocations[0].fsPath, { encoding: 'utf8' })
            server.postMessage({
                command: 'loadedSample',
                sample: fileContent,
                selectedFile: fileLocations[0].path,
            })
        } catch (e) {
            getLogger().error('readFileSync: Failed to read file at path %O', fileLocations[0].fsPath, e)
            vscode.window.showErrorMessage((e as Error).message)
        }
        return
    } else {
        throw new Error(`Message is invalid: ${message}`)
    }
}
