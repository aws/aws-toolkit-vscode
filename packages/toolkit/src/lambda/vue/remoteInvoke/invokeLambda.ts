/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { _Blob } from 'aws-sdk/clients/lambda'
import { readFileSync } from 'fs'
import * as _ from 'lodash'
import * as vscode from 'vscode'
import { DefaultLambdaClient, LambdaClient } from '../../../shared/clients/lambdaClient'
import { ExtContext } from '../../../shared/extensions'

import { getLogger } from '../../../shared/logger'
import { HttpResourceFetcher } from '../../../shared/resourcefetcher/httpResourceFetcher'
import { sampleRequestPath } from '../../constants'
import { LambdaFunctionNode } from '../../explorer/lambdaFunctionNode'
import { getSampleLambdaPayloads, SampleRequest } from '../../utils'

import * as nls from 'vscode-nls'
import { VueWebview } from '../../../webviews/main'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { Result } from '../../../shared/telemetry/telemetry'

const localize = nls.loadMessageBundle()

export interface InitialData {
    FunctionName: string
    FunctionArn: string
    FunctionRegion: string
    InputSamples: SampleRequest[]
}

export interface RemoteInvokeData {
    initialData: InitialData
    selectedSampleRequest: string
    sampleText: string
    selectedFile: string
}

export class RemoteInvokeWebview extends VueWebview {
    public readonly id = 'remoteInvoke'
    public readonly source = 'src/lambda/vue/remoteInvoke/index.js'

    public constructor(
        private readonly channel: vscode.OutputChannel,
        private readonly client: LambdaClient,
        private readonly data: InitialData
    ) {
        super()
    }

    public init() {
        return this.data
    }

    public async invokeLambda(input: string): Promise<void> {
        let result: Result = 'Succeeded'

        this.channel.show()
        this.channel.appendLine('Loading response...')

        try {
            const funcResponse = await this.client.invoke(this.data.FunctionArn, input)
            const logs = funcResponse.LogResult ? Buffer.from(funcResponse.LogResult, 'base64').toString() : ''
            const payload = funcResponse.Payload ? funcResponse.Payload : JSON.stringify({})

            this.channel.appendLine(`Invocation result for ${this.data.FunctionArn}`)
            this.channel.appendLine('Logs:')
            this.channel.appendLine(logs)
            this.channel.appendLine('')
            this.channel.appendLine('Payload:')
            this.channel.appendLine(payload.toString())
            this.channel.appendLine('')
        } catch (e) {
            const error = e as Error
            this.channel.appendLine(`There was an error invoking ${this.data.FunctionArn}`)
            this.channel.appendLine(error.toString())
            this.channel.appendLine('')
            result = 'Failed'
        } finally {
            telemetry.lambda_invokeRemote.emit({ result, passive: false })
        }
    }

    public async getSample(requestName: string) {
        const sampleUrl = `${sampleRequestPath}${requestName}`
        const sample = (await new HttpResourceFetcher(sampleUrl, { showUrl: true }).get()) ?? ''

        return sample
    }

    public async promptFile() {
        const fileLocations = await vscode.window.showOpenDialog({
            openLabel: 'Open',
        })

        if (!fileLocations || fileLocations.length === 0) {
            return undefined
        }

        try {
            const fileContent = readFileSync(fileLocations[0].fsPath, { encoding: 'utf8' })

            return {
                sample: fileContent,
                selectedFile: fileLocations[0].path,
            }
        } catch (e) {
            getLogger().error('readFileSync: Failed to read file at path %O', fileLocations[0].fsPath, e)
            void vscode.window.showErrorMessage((e as Error).message)
        }
    }
}

const Panel = VueWebview.compilePanel(RemoteInvokeWebview)

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
    const client = new DefaultLambdaClient(params.functionNode.regionCode)

    const wv = new Panel(context.extensionContext, context.outputChannel, client, {
        FunctionName: params.functionNode.configuration.FunctionName ?? '',
        FunctionArn: params.functionNode.configuration.FunctionArn ?? '',
        FunctionRegion: params.functionNode.regionCode,
        InputSamples: inputs,
    })

    await wv.show({ title: localize('AWS.invokeLambda.title', 'Invoke Lambda {0}', params.functionNode.functionName) })
}
