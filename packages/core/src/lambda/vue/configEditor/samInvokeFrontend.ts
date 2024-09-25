/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Disable because it is a front-end file.
/* eslint-disable aws-toolkits/no-console-log */

import { defineComponent } from 'vue'
import { AwsSamDebuggerConfiguration } from '../../../shared/sam/debugger/awsSamDebugConfiguration'
import {
    AwsSamDebuggerConfigurationLoose,
    LaunchConfigPickItem,
    ResourceData,
    SamInvokeWebview,
} from './samInvokeBackend'
import settingsPanel from '../../../webviews/components/settingsPanel.vue'
import { WebviewClientFactory } from '../../../webviews/client'
import saveData from '../../../webviews/mixins/saveData'

const client = WebviewClientFactory.create<SamInvokeWebview>()

const savedStatus = {
    saved: 'SAVED',
    unsaved: 'UNSAVED',
}

interface VueDataLaunchPropertyObject {
    value: string
    errorMsg: string
}
interface SamInvokeVueData {
    msg: any
    targetTypes: { [k: string]: string }[]
    runtimes: string[]
    company: string
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
    selectedConfig: LaunchConfigPickItem
    payloadOption: string
    selectedFile: string
    selectedFilePath: string
    selectedTestEvent: string
    TestEvents: string[]
    showNameInput: boolean
    newTestEventName: string
    resourceData: ResourceData | undefined
    savedStatus: string
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
            runtime: existingConfig?.lambda?.runtime,
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
            httpMethod: 'get',
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

function initData() {
    return {
        containerBuild: false,
        skipNewImageCheck: false,
        launchConfig: newLaunchConfig(),
        payload: { value: '', errorMsg: '' },
        apiPayload: { value: '', errorMsg: '' },
        environmentVariables: { value: '', errorMsg: '' },
        parameters: { value: '', errorMsg: '' },
        headers: { value: '', errorMsg: '' },
        stageVariables: { value: '', errorMsg: '' },
        selectedConfig: { index: 0, config: undefined, label: 'new-config' },
        selectedTestEvent: '',
        TestEvents: [],
        showNameInput: false,
        newTestEventName: '',
        savedStatus: savedStatus.unsaved,
    }
}

export default defineComponent({
    name: 'sam-invoke',
    components: {
        settingsPanel,
    },
    created() {
        this.setUpWebView()
    },
    mixins: [saveData],
    data(): SamInvokeVueData {
        return {
            ...initData(),
            msg: 'Hello',
            company: '',
            targetTypes: [
                { name: 'Code', value: 'code' },
                { name: 'Template', value: 'template' },
                { name: 'API Gateway (Template)', value: 'api' },
            ],
            runtimes: [],
            httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'PATCH'],
            payloadOption: 'sampleEvents',
            selectedFile: '',
            selectedFilePath: '',
            resourceData: undefined,
        }
    },
    methods: {
        resetJsonErrors() {
            this.payload.errorMsg = ''
            this.environmentVariables.errorMsg = ''
            this.headers.errorMsg = ''
            this.stageVariables.errorMsg = ''
        },
        launch() {
            const config = this.formatConfig()

            if (!config) {
                return // Exit early if config is not available
            }

            const source = this.resourceData?.source

            client.invokeLaunchConfig(config, source).catch((e: Error) => {
                console.error(`invokeLaunchConfig failed: ${e.message}`)
            })
        },
        save() {
            const config = this.formatConfig()
            config &&
                client.saveLaunchConfig(config).catch((e) => {
                    console.error('saveLaunchConfig failed: %s', (e as Error).message)
                })
        },
        loadConfig() {
            client.loadSamLaunchConfig().then(
                (config) => this.parseConfig(config),
                (e) => {
                    console.error('client.loadSamLaunchConfig failed: %s', (e as Error).message)
                }
            )
        },
        updateConfig() {
            this.parseConfig(this.selectedConfig.config)
            this.savedStatus = savedStatus.saved
        },
        parseConfig(config?: AwsSamDebuggerConfiguration) {
            if (!config) {
                return
            }
            const company = this.company
            this.clearForm()
            this.launchConfig = newLaunchConfig(config)
            if (config.lambda?.payload) {
                this.payload.value = JSON.stringify(config.lambda.payload.json, undefined, 4)
            }
            if (config.lambda?.environmentVariables) {
                this.environmentVariables.value = JSON.stringify(config.lambda?.environmentVariables)
            }
            if (config.sam?.template?.parameters) {
                this.parameters.value = JSON.stringify(config.sam?.template?.parameters)
            }
            if (config.api?.headers) {
                this.headers.value = JSON.stringify(config.api?.headers)
            }
            if (config.api?.stageVariables) {
                this.stageVariables.value = JSON.stringify(config.api?.stageVariables)
            }
            this.containerBuild = config.sam?.containerBuild ?? false
            this.skipNewImageCheck = config.sam?.skipNewImageCheck ?? false
            this.msg = `Loaded config: ${config.name}`
            this.company = company
        },
        loadPayload() {
            this.resetJsonErrors()
            client.getSamplePayload().then(
                (sample) => {
                    if (!sample) {
                        return
                    }
                    this.payload.value = JSON.stringify(JSON.parse(sample), undefined, 4)
                },
                (e) => {
                    console.error('client.getSamplePayload failed: %s', (e as Error).message)
                }
            )
        },
        loadResource() {
            this.resetJsonErrors()
            client.getTemplate().then(
                (template) => {
                    if (!template) {
                        return
                    }
                    this.launchConfig.invokeTarget.target = 'template'
                    this.launchConfig.invokeTarget.logicalId = template.logicalId
                    this.launchConfig.invokeTarget.templatePath = template.template
                },
                (e) => {
                    console.error('client.getTemplate failed: %s', (e as Error).message)
                }
            )
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
        async openLaunchJson() {
            await client.openLaunchConfig()
        },
        onFileChange(event: Event) {
            const input = event.target as HTMLInputElement
            if (input.files && input.files.length > 0) {
                const file = input.files[0]
                this.selectedFile = file.name

                // Use Blob.text() to read the file as text
                file.text()
                    .then((text) => {
                        this.payload.value = text
                    })
                    .catch((error) => {
                        console.error('Error reading file:', error)
                    })
            }
        },
        async promptForFileLocation() {
            const resp = await client.promptFile()
            if (resp) {
                this.selectedFile = resp.selectedFile
                this.selectedFilePath = resp.selectedFilePath
            }
        },
        async reloadFile() {
            if (this.selectedFile) {
                const resp = await client.readFile(this.selectedFilePath)
                if (resp) {
                    this.selectedFile = resp.selectedFile
                    this.selectedFilePath = resp.selectedFilePath
                }
            }
        },
        async newSelection() {
            if (this.resourceData) {
                const eventData = {
                    name: this.selectedTestEvent,
                    region: this.resourceData.region,
                    arn: this.resourceData.arn,
                    stackName: this.resourceData.stackName,
                    logicalId: this.resourceData.logicalId,
                }
                const resp = await client.getRemoteTestEvents(eventData)
                this.payload.value = JSON.stringify(JSON.parse(resp), undefined, 4)
            }
        },
        async saveEvent() {
            if (this.resourceData) {
                const eventData = {
                    name: this.newTestEventName,
                    event: this.payload.value,
                    region: this.resourceData.region,
                    arn: this.resourceData.arn,
                    stackName: this.resourceData.stackName,
                    logicalId: this.resourceData.logicalId,
                }
                await client.createRemoteTestEvents(eventData)
                this.showNameInput = false
                this.newTestEventName = ''
                this.TestEvents = await client.listRemoteTestEvents(
                    this.resourceData.region,
                    this.resourceData.stackName,
                    this.resourceData.logicalId
                )
            }
        },
        showNameField() {
            this.showNameInput = true
        },
        setUpWebView() {
            client.init().then(
                (config) => this.parseConfig(config),
                (e) => {
                    console.error('client.init failed: %s', (e as Error).message)
                }
            )

            client.getResourceData().then(
                (data) => {
                    this.resourceData = data
                    if (this.launchConfig && this.resourceData) {
                        this.launchConfig.invokeTarget.logicalId = this.resourceData.logicalId
                        this.launchConfig.invokeTarget.templatePath = this.resourceData.location
                        this.launchConfig.invokeTarget.lambdaHandler = this.resourceData.handler
                        if (this.launchConfig.lambda) {
                            this.launchConfig.lambda.runtime = this.resourceData.runtime
                        }

                        client
                            .listRemoteTestEvents(
                                this.resourceData.region,
                                this.resourceData.stackName,
                                this.resourceData.logicalId
                            )
                            .then(
                                (events) => {
                                    this.TestEvents = events
                                },
                                (e) => {
                                    console.error('client.listRemoteTestEvents failed: %s', (e as Error).message)
                                }
                            )
                    }
                },
                (e) => {
                    console.error('client.getResourceData failed: %s', (e as Error).message)
                }
            )

            client.getRuntimes().then(
                (runtimes) => {
                    this.runtimes = runtimes
                },
                (e) => {
                    console.error('client.getRuntimes failed: %s', (e as Error).message)
                }
            )

            client.getCompanyName().then(
                (o) => {
                    this.company = o
                },
                (e) => {
                    console.error('client.getCompanyName failed: %s', (e as Error).message)
                }
            )
        },
        formatConfig() {
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

            return {
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
            }
        },
        clearForm() {
            const init = initData()
            Object.keys(init).forEach((k) => {
                ;(this as any)[k] = init[k as keyof typeof init]
            })
        },
    },
})
