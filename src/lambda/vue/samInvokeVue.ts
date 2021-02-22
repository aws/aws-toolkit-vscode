/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import Vue, { VNode } from 'vue'
import { VsCode } from '../../webviews/main'
import {
    MorePermissiveAwsSamDebuggerConfiguration,
    SamInvokerRequest,
    SamInvokerResponse,
    SamInvokeVueState,
} from './samInvoke'

declare const vscode: VsCode<SamInvokerRequest, SamInvokeVueState>

export interface SamInvokeVueData {
    msg: any
    showAllFields: boolean
    jsonError: string
    targetTypes: { [k: string]: string }[]
    runtimes: string[]
    httpMethods: string[]
    launchConfig: MorePermissiveAwsSamDebuggerConfiguration
    payload: string
}

function newLaunchConfig(target: 'template' | 'code' | 'api' = 'template'): MorePermissiveAwsSamDebuggerConfiguration {
    return {
        type: 'aws-sam',
        request: 'direct-invoke',
        name: '',
        aws: {
            credentials: '',
            region: '',
        },
        invokeTarget: {
            target,
            templatePath: '',
            logicalId: '',
            lambdaHandler: '',
            projectRoot: '',
        },
        lambda: {
            payload: {
                json: {},
                path: '',
            },
            environmentVariables: {},
            runtime: '',
            memoryMb: undefined,
            timeoutSec: undefined,
            pathMappings: undefined
        },
        sam: {
            buildArguments: undefined,
            containerBuild: false,
            dockerNetwork: '',
            localArguments: undefined,
            skipNewImageCheck: false,
            template: {
                parameters: undefined
            }
        },
        api: {
            path: '',
            httpMethod: 'get',
            payload: {
                json: undefined,
                path: ''
            },
            headers: undefined,
            querystring: '',
            stageVariables: undefined,
            clientCertificateId: ''
        }
    }
}
export const Component = Vue.extend({
    created() {
        const oldState = vscode.getState()
        if (oldState) {
            this.launchConfig = oldState.launchConfig
            this.payload = oldState.payload
        }
        window.addEventListener('message', ev => {
            const event = ev.data as SamInvokerResponse
            switch (event.command) {
                case 'getSamplePayload':
                    this.payload = JSON.stringify(JSON.parse(event.data.payload), undefined, 4)
                    break
                case 'getTemplate':
                    this.launchConfig.invokeTarget.target = 'template'
                    this.launchConfig.invokeTarget.logicalId = event.data.logicalId
                    this.launchConfig.invokeTarget.templatePath = event.data.template
                    break
                case 'loadSamLaunchConfig':
                    this.launchConfig = event.data.launchConfig as MorePermissiveAwsSamDebuggerConfiguration
                    if (event.data.launchConfig.lambda?.payload) {
                        this.payload = JSON.stringify(event.data.launchConfig.lambda.payload.json, undefined, 4)
                    }
                    this.msg = `Loaded config ${event.data.launchConfig.name}`
                    break
            }
        })
    },
    data(): SamInvokeVueData {
        return {
            msg: 'Hello',
            showAllFields: false,
            jsonError: '',
            targetTypes: [
                { name: 'Code', value: 'code' },
                { name: 'Template', value: 'template' },
                { name: 'API Gateway (Template)', value: 'api' },
            ],
            runtimes: [
                'nodejs10.x',
                'nodejs12.x',
                'nodejs14.x',
                'python2.7',
                'python3.6',
                'python3.7',
                'python3.8',
                'dotnetcore2.1',
                'dotnetcore3.1',
            ],
            httpMethods: ['GET', 'POST', 'PUT', 'DELETE'],
            launchConfig: newLaunchConfig(),
            payload: '',
        }
    },
    watch: {
        launchConfig: {
            handler(newval: MorePermissiveAwsSamDebuggerConfiguration) {
                vscode.setState({
                    payload: this.payload,
                    launchConfig: newval,
                })
            },
            deep: true,
        },
        payload: function (newval: string) {
            this.resetJsonError()
            vscode.setState({
                payload: newval,
                launchConfig: this.launchConfig,
            })
        },
    },
    methods: {
        resetJsonError() {
            this.jsonError = ''
        },
        launch() {
            this.resetJsonError()
            let payloadJson: { [k: string]: any } = {}
            if (this.payload !== '') {
                try {
                    payloadJson = JSON.parse(this.payload)
                } catch (e) {
                    this.jsonError = e
                    console.log(e)
                    return
                }
            }

            vscode.postMessage({
                command: 'invokeLaunchConfig',
                data: {
                    launchConfig: {
                        ...this.launchConfig,
                        lambda: {
                            ...this.launchConfig.lambda,
                            payload: {
                                ...this.launchConfig.payload,
                                json: payloadJson,
                            },
                        },
                    },
                },
            })
        },
        save() {
            this.resetJsonError()
            let payloadJson: { [k: string]: any } = {}
            if (this.payload !== '') {
                try {
                    payloadJson = JSON.parse(this.payload)
                } catch (e) {
                    this.jsonError = e
                    console.log(e)
                    return
                }
            }
            vscode.postMessage({
                command: 'saveLaunchConfig',
                data: {
                    launchConfig: {
                        ...this.launchConfig,
                        lambda: {
                            ...this.launchConfig.lambda,
                            payload: {
                                ...this.launchConfig.payload,
                                json: payloadJson,
                            },
                        },
                    },
                },
            })
        },
        loadConfig() {
            this.resetJsonError()
            vscode.postMessage({
                command: 'loadSamLaunchConfig',
            })
        },
        loadPayload() {
            this.resetJsonError()
            vscode.postMessage({
                command: 'getSamplePayload',
            })
        },
        loadResource() {
            this.resetJsonError()
            vscode.postMessage({
                command: 'getTemplate',
            })
        },
        toggleShowAllFields() {
            this.showAllFields = !this.showAllFields
        }
    },
    // `createElement` is inferred, but `render` needs return type
    template: `
<template>
    <form class="invoke-lambda-form">
        <h1>Invoke Local Lambda</h1>
        <button v-on:click.prevent="loadConfig">Load Existing Debug Configuration</button><br />
        <div class="config-details">
            <div class="section-header">
                <h2>Configuration Details</h2>
            </div>
            <label for="target-type-selector">Invoke Target Type</label>
            <select name="target-types" id="target-type-selector" v-model="launchConfig.invokeTarget.target">
                <option :value="type.value" v-for="(type, index) in targetTypes" :key="index">{{ type.name }}</option>
            </select>
            <div class="target-code" v-if="launchConfig.invokeTarget.target === 'code'">
                <div class="config-item">
                    <label for="select-directory">Project Root  <span class="tooltip">i<span class="tooltip-text"> Heplful tooltip with explanation and example: <br>Example path: home/folder/file</span></span></label>
                    <input
                        id="select-directory"
                        v-model="launchConfig.invokeTarget.projectRoot"
                        placeholder="Enter a directory"
                    />
                    <span class="data-view">the selected directory: {{ launchConfig.invokeTarget.projectRoot }}</span>
                </div>
                <div class="config-item">
                    <label for="lambda-handler">Lambda Handler</label>
                    <input
                        type="text"
                        placeholder="Enter the lambda handler"
                        name="lambda-handler"
                        id="lambda-handler"
                        v-model="launchConfig.invokeTarget.lambdaHandler"
                    />
                    <span class="data-view">lamda handler :{{ launchConfig.invokeTarget.lambdaHandler }}</span>
                </div>
                <div class="config-item">
                    <label for="runtime-selector">Runtime</label>
                    <select name="runtimeType" v-model="launchConfig.lambda.runtime">
                        <option disabled>Choose a runtime...</option>
                        <option v-for="(runtime, index) in runtimes" v-bind:value="runtime" :key="index">
                            {{ runtime }}
                        </option>
                    </select>
                    <span class="data-view">runtime in data: {{ launchConfig.lambda.runtime }}</span>
                </div>
            </div>
            <div class="target-template" v-else-if="launchConfig.invokeTarget.target === 'template'">
                <button v-on:click.prevent="loadResource">Load Resource</button><br />
                <div class="config-item">
                    <label for="template-path">Template Path</label>
                    <input
                        id="template-path-button"
                        v-model="launchConfig.invokeTarget.templatePath"
                        placeholder="Enter the template path..."
                    /><span class="data-view"
                        >Template path from data: {{ launchConfig.invokeTarget.templatePath }}</span
                    >
                </div>
                <div class="config-item">
                    <label for="logicalID">Resource (Logical Id)</label>
                    <input
                        name="template-logical-id"
                        id="template-logical-id"
                        placeholder="Enter a resource"
                        v-model="launchConfig.invokeTarget.logicalId"
                    /><span class="data-view"> Logical Id from data: {{ launchConfig.invokeTarget.logicalId }}</span>
                </div>
            </div>
            <div class="target-apigw" v-else-if="launchConfig.invokeTarget.target === 'api'">
                <button v-on:click.prevent="loadResource">Load Resource</button><br />
                <div class="config-item">
                    <label for="template-path">Template Path</label>
                    <input
                        id="template-path-button"
                        v-model="launchConfig.invokeTarget.templatePath"
                        placeholder="Enter the template path..."
                    /><span class="data-view"
                        >Template path from data: {{ launchConfig.invokeTarget.templatePath }}</span
                    >
                </div>
                <div class="config-item">
                    <label for="logicalID">Resource (Logical Id)</label>
                    <input
                        name="template-logical-id"
                        id="template-logical-id"
                        placeholder="Enter a resource"
                        v-model="launchConfig.invokeTarget.logicalId"
                    />
                </div>
                <div class="config-item">
                    <label for="path">Path</label>
                    <input type="text" v-model="launchConfig.api.path" >
                </div>
                <div class="config-item">
                    <label for="http-method-selector">HTTP Method</label>
                    <select name="http-method"  v-model="launchConfig.api.httpMethod">
                        <option v-for="(method, index) in httpMethods" v-bind:value="method" :key="index">
                            {{ method }}
                        </option>
                    </select>
                </div>
                <div class="config-item">
                    <label for="query-string">Query String</label>
                    <input name="query-string" id="query-string" cols="15" rows="2" placeholder="Enter a query" />
                </div>
                <div class="config-item">
                    <label for="headers">Headers</label>
                    <input type="text" v-model="launchConfig.api.headers" >
                </div>
            </div>
            <div v-else>Select an Invoke Target</div>
            <button @click="toggleShowAllFields">{{showAllFields ? "Show Less Fields" : "Show All Fields"}}</button>
            <div v-if="showAllFields">
                <h3>aws</h3>
                <div class="config-item">
                    <label for="awsConnection">Credentials:</label>
                    <input type="text" v-model="launchConfig.aws.credentials" >
                </div>
                <div class="config-item">
                    <label for="region">Region</label>
                    <input type="text" v-model="launchConfig.aws.region" >
                </div>
                <h3>lambda</h3>
                <div class="config-item">
                    <label for="">Environment Variables</label>
                    <input type="text" v-model="launchConfig.lambda.environmentVariables" >
                </div>
                <div class="config-item">
                    <label for="runtime-selector">Runtime</label>
                    <select name="runtimeType" v-model="launchConfig.lambda.runtime">
                        <option disabled>Choose a runtime...</option>
                        <option v-for="(runtime, index) in runtimes" v-bind:value="runtime" :key="index">
                            {{ runtime }}
                        </option>
                    </select>
                </div>
                <div class="config-item">
                    <label for="memory">Memory</label>
                    <input type="number" v-model="launchConfig.lambda.memoryMb" >
                </div>
                <div class="config-item">
                    <label for="timeoutSec">Timeout (s)</label>
                    <input type="number" v-model="launchConfig.lambda.timeoutSec" >
                </div>
                <div class="config-item">
                    <label for="pathMappings">Path Mappings</label>
                    <input type="text" v-model="launchConfig.lambda.pathMappings" >
                </div>
                <h3>sam</h3>
                <div class="config-item">
                    <label for="buildArguments">Build Arguments</label>
                    <input type="text" v-model="launchConfig.sam.buildArguments" >
                </div>
                <div class="config-item">
                    <label for="containerBuild">Container Build</label>
                    <select name="containerBuild" id="containerBuild" v-model="launchConfig.sam.containerBuild">
                        <option value=false :key="0">False</option>
                        <option value=true :key="1">True</option>
                    </select>
                </div>
                <div class="config-item">
                    <label for="dockerNetork">Docker Network</label>
                    <input type="text" v-model="launchConfig.sam.dockerNetork">
                </div>
                <div class="config-item">
                    <label for="localArugments">Local Arguments</label>
                    <input type="text" v-model="launchConfig.sam.localArugments" >
                </div>
                <div class="config-item">
                    <label for="skipNewImageCheck">Skip New Image Check</label>
                    <select name="skipNewImageCheck" id="skipNewImageCheck" v-model="launchConfig.sam.skipNewImageCheck">
                        <option value=false :key="0">False</option>
                        <option value=true :key="1">True</option>
                    </select>
                </div>
                <div class="config-item">
                    <label for="templateParameters">Template - Parameters</label>
                    <input type="text" v-model="launchConfig.sam.template.parameters" >
                </div>
                <h3>api</h3>
                <div class="config-item">
                    <label for="path">Path</label>
                    <input type="text" v-model="launchConfig.api.path" >
                </div>
                <div class="config-item">
                    <label for="http-method-selector">HTTP Method</label>
                    <select name="http-method" v-model="launchConfig.api.httpMethod">
                        <option v-for="(method, index) in httpMethods" v-bind:value="method" :key="index">
                            {{ method }}
                        </option>
                    </select>
                </div>
                <div class="config-item">
                    <label for="headers">Headers</label>
                    <input type="text" v-model="launchConfig.api.headers" >
                </div>
                <div class="config-item">
                    <label for="querystring">Query String</label>
                    <input type="text" v-model="launchConfig.api.querystring" >
                </div>
                <div class="config-item">
                    <label for="stageVariables">Stage Variables []</label>
                    <input type="text" v-model="launchConfig.api.stageVariables" >
                </div>
                <div class="config-item">
                    <label for="clientCerificateId">Client Certificate ID</label>
                    <input type="text" v-model="launchConfig.api.clientCerificateId" >
                </div>
            </div>
        </div>
        <div class="payload-section">
            <div class="section-header">
                <h2>Payload</h2>
            </div>
            <button v-on:click.prevent="loadPayload">Load Sample Payload</button><br />
            <textarea name="lambda-payload" id="lambda-payload" cols="60" rows="5" v-model="payload"></textarea>
            <span class="data-view">payload from data: {{ payload }} </span>
            <div class="json-parse-error" v-if="jsonError && payload">Error parsing JSON: {{jsonError}}</div>
        </div>
        <div class="required">*Required</div>
        <div class="invoke-button-container">
            <button v-on:click.prevent="save">Save Debug Configuration</button>
            <button id="invoke-button" v-on:click.prevent="launch">Invoke Debug Configuration</button>
        </div>
    </form>
</template>
`,
})

new Vue({
    el: '#vueApp',
    render: (createElement): VNode => {
        return createElement(Component)
    },
})
