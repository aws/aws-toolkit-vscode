/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineComponent } from 'vue'
import { WebviewApi } from 'vscode-webview'
import { AwsSamDebuggerConfiguration } from '../../shared/sam/debugger/awsSamDebugConfiguration'
import { AwsSamDebuggerConfigurationLoose, SamInvokerResponse, SamInvokeVueState } from './samInvokeBackend'
import settingsPanel from '../../webviews/components/settingsPanel.vue'

declare const vscode: WebviewApi<SamInvokeVueState>

interface VueDataLaunchPropertyObject {
    value: string
    errorMsg: string
}
export interface SamInvokeVueData {
    msg: any
    targetTypes: { [k: string]: string }[]
    runtimes: string[]
    httpMethods: string[]
    launchConfig: AwsSamDebuggerConfigurationLoose
    payload: VueDataLaunchPropertyObject
    apiPayload: VueDataLaunchPropertyObject
    environmentVariables: VueDataLaunchPropertyObject
    headers: VueDataLaunchPropertyObject
    stageVariables: VueDataLaunchPropertyObject
    parameters: VueDataLaunchPropertyObject
    containerBuild: boolean
    skipNewImageCheck: boolean
}

function newLaunchConfig(existingConfig?: AwsSamDebuggerConfiguration): AwsSamDebuggerConfigurationLoose {
    return {
        type: 'aws-sam',
        request: 'direct-invoke',
        name: '',
        aws: {
            credentials: '',
            region: '',
            ...(existingConfig?.aws ? existingConfig.aws : {}),
        },
        invokeTarget: {
            target: 'template',
            templatePath: '',
            logicalId: '',
            lambdaHandler: '',
            projectRoot: '',
            ...existingConfig?.invokeTarget,
        },
        lambda: {
            runtime: '',
            memoryMb: undefined,
            timeoutSec: undefined,
            environmentVariables: {},
            ...existingConfig?.lambda,
            payload: {
                json: existingConfig?.lambda?.payload?.json ? existingConfig.lambda.payload.json : {},
                path: existingConfig?.lambda?.payload?.path ? existingConfig.lambda.payload.path : '',
            },

            // pathMappings: undefined
        },
        sam: {
            buildArguments: undefined,
            containerBuild: false,
            dockerNetwork: '',
            localArguments: undefined,
            skipNewImageCheck: false,
            ...(existingConfig?.sam ? existingConfig.sam : {}),
            template: {
                parameters: existingConfig?.sam?.template?.parameters ? existingConfig.sam.template.parameters : {},
            },
        },
        api: {
            path: '',
            httpMethod: '',
            clientCertificateId: '',
            querystring: '',
            headers: {},
            stageVariables: {},
            ...(existingConfig?.api ? existingConfig.api : {}),
            payload: {
                json: existingConfig?.api?.payload?.json ? existingConfig.api.payload.json : {},
                path: existingConfig?.api?.payload?.path ? existingConfig.api.payload.path : '',
            },
        },
    }
}

export default defineComponent({
    components: {
        settingsPanel,
    },
    created() {
        window.addEventListener('message', ev => {
            const event = ev.data as SamInvokerResponse
            switch (event.command) {
                case 'getRuntimes':
                    this.runtimes = event.data.runtimes
                    break
                case 'getSamplePayload':
                    this.payload.value = JSON.stringify(JSON.parse(event.data.payload), undefined, 4)
                    break
                case 'getTemplate':
                    this.launchConfig.invokeTarget.target = 'template'
                    this.launchConfig.invokeTarget.logicalId = event.data.logicalId
                    this.launchConfig.invokeTarget.templatePath = event.data.template
                    break
                case 'loadSamLaunchConfig':
                    this.clearForm()
                    this.launchConfig = newLaunchConfig(event.data.launchConfig)
                    if (event.data.launchConfig.lambda?.payload) {
                        this.payload.value = JSON.stringify(event.data.launchConfig.lambda.payload.json, undefined, 4)
                    }
                    if (event.data.launchConfig.lambda?.environmentVariables) {
                        this.environmentVariables.value = JSON.stringify(
                            event.data.launchConfig.lambda?.environmentVariables
                        )
                    }
                    if (event.data.launchConfig.sam?.template?.parameters) {
                        this.parameters.value = JSON.stringify(event.data.launchConfig.sam?.template?.parameters)
                    }
                    if (event.data.launchConfig.api?.headers) {
                        this.headers.value = JSON.stringify(event.data.launchConfig.api?.headers)
                    }
                    if (event.data.launchConfig.api?.stageVariables) {
                        this.stageVariables.value = JSON.stringify(event.data.launchConfig.api?.stageVariables)
                    }
                    this.containerBuild = event.data.launchConfig.sam?.containerBuild ?? false
                    this.skipNewImageCheck = event.data.launchConfig.sam?.containerBuild ?? false
                    this.msg = `Loaded config ${event.data.launchConfig.name}`
                    break
            }
        })

        // Send a message back to let the backend know we're ready for messages
        vscode.postMessage({ command: 'initialized' })

        const oldState: Partial<SamInvokeVueState> = vscode.getState() ?? {}
        this.launchConfig = oldState.launchConfig ?? this.launchConfig
        this.payload = oldState.payload ?? this.payload
    },
    data(): SamInvokeVueData {
        return {
            msg: 'Hello',
            targetTypes: [
                { name: 'Code', value: 'code' },
                { name: 'Template', value: 'template' },
                { name: 'API Gateway (Template)', value: 'api' },
            ],
            containerBuild: false,
            skipNewImageCheck: false,
            runtimes: [],
            httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'PATCH'],
            launchConfig: newLaunchConfig(),
            payload: { value: '', errorMsg: '' },
            apiPayload: { value: '', errorMsg: '' },
            environmentVariables: { value: '', errorMsg: '' },
            parameters: { value: '', errorMsg: '' },
            headers: { value: '', errorMsg: '' },
            stageVariables: { value: '', errorMsg: '' },
        }
    },
    watch: {
        launchConfig: {
            handler(newval: AwsSamDebuggerConfigurationLoose) {
                vscode.setState(
                    Object.assign(vscode.getState() ?? {}, {
                        launchConfig: newval,
                    } as SamInvokeVueState)
                )
            },
            deep: true,
        },
        payload: function (newval: { value: string; errorMsg: string }) {
            this.resetJsonErrors()
            vscode.setState(
                Object.assign(vscode.getState() ?? {}, {
                    payload: newval,
                } as SamInvokeVueState)
            )
        },
    },
    methods: {
        resetJsonErrors() {
            this.payload.errorMsg = ''
            this.environmentVariables.errorMsg = ''
            this.headers.errorMsg = ''
            this.stageVariables.errorMsg = ''
        },
        launch() {
            this.formatDataAndExecute('invokeLaunchConfig')
        },
        save() {
            this.formatDataAndExecute('saveLaunchConfig')
        },
        feedback() {
            vscode.postMessage({
                command: 'feedback',
            })
        },
        loadConfig() {
            vscode.postMessage({
                command: 'loadSamLaunchConfig',
            })
        },
        loadPayload() {
            this.resetJsonErrors()
            vscode.postMessage({
                command: 'getSamplePayload',
            })
        },
        loadResource() {
            this.resetJsonErrors()
            vscode.postMessage({
                command: 'getTemplate',
            })
        },
        formatFieldToStringArray(field: string | undefined) {
            if (!field) {
                return undefined
            }
            //Reg ex for a comma with 0 or more whitespace before and/or after
            const re = /\s*,\s*/g
            return field.trim().split(re)
        },
        formatStringtoJSON(field: VueDataLaunchPropertyObject) {
            field.errorMsg = ''
            if (field.value) {
                try {
                    return JSON.parse(field.value)
                } catch (e) {
                    field.errorMsg = (e as Error).message
                    throw e
                }
            }
        },
        formatDataAndExecute(command: 'saveLaunchConfig' | 'invokeLaunchConfig') {
            this.resetJsonErrors()

            let payloadJson, environmentVariablesJson, headersJson, stageVariablesJson, parametersJson, apiPayloadJson

            try {
                payloadJson = this.formatStringtoJSON(this.payload)
                environmentVariablesJson = this.formatStringtoJSON(this.environmentVariables)
                headersJson = this.formatStringtoJSON(this.headers)
                stageVariablesJson = this.formatStringtoJSON(this.stageVariables)
                parametersJson = this.formatStringtoJSON(this.parameters)
                apiPayloadJson = this.formatStringtoJSON(this.apiPayload)
            } catch {
                return
            }

            // Vue internally stores a Proxy for all object-like fields, so the spread operator can
            // propagate those through to the `postMessage` command, causing an error. We can stop
            // this by recursively accessing all primitive fields (which is what this line does)
            const launchConfig: AwsSamDebuggerConfigurationLoose = JSON.parse(JSON.stringify(this.launchConfig))

            vscode.postMessage({
                command: command,
                data: {
                    launchConfig: {
                        ...launchConfig,
                        lambda: {
                            ...launchConfig.lambda,
                            payload: {
                                ...launchConfig.payload,
                                json: payloadJson,
                            },
                            environmentVariables: environmentVariablesJson,
                        },
                        sam: {
                            ...launchConfig.sam,
                            buildArguments: this.formatFieldToStringArray(launchConfig.sam?.buildArguments?.toString()),
                            localArguments: this.formatFieldToStringArray(launchConfig.sam?.localArguments?.toString()),
                            containerBuild: this.containerBuild,
                            skipNewImageCheck: this.skipNewImageCheck,
                            template: {
                                parameters: parametersJson,
                            },
                        },
                        api: launchConfig.api
                            ? {
                                  ...launchConfig.api,
                                  headers: headersJson,
                                  stageVariables: stageVariablesJson,
                                  payload: {
                                      json: apiPayloadJson,
                                  },
                              }
                            : undefined,
                    },
                },
            })
        },
        clearForm() {
            this.launchConfig = newLaunchConfig()
            this.containerBuild = false
            this.skipNewImageCheck = false
            this.payload = { value: '', errorMsg: '' }
            this.apiPayload = { value: '', errorMsg: '' }
            this.environmentVariables = { value: '', errorMsg: '' }
            this.parameters = { value: '', errorMsg: '' }
            this.headers = { value: '', errorMsg: '' }
            this.stageVariables = { value: '', errorMsg: '' }
        },
    },
})
