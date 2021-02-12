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
    targetTypes: { [k: string]: string }[]
    runtimes: string[]
    httpMethods: ['GET', 'POST', 'PUT']
    launchConfig: MorePermissiveAwsSamDebuggerConfiguration
    payload: string
}

function newLaunchConfig(): MorePermissiveAwsSamDebuggerConfiguration {
    return {
        type: 'aws-sam',
        request: 'direct-invoke',
        name: '',
        invokeTarget: {
            target: 'template',
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
        },
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
                    this.msg = `Loaded config ${event.data.launchConfig.name}`
                    break
            }
        })
    },
    data(): SamInvokeVueData {
        return {
            msg: 'Hello',
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
            httpMethods: ['GET', 'POST', 'PUT'],
            launchConfig: newLaunchConfig(),
            payload: '',
        }
    },
    watch: {
        launchConfig: function (newval: MorePermissiveAwsSamDebuggerConfiguration) {
            vscode.setState({
                payload: this.payload,
                launchConfig: newval,
            })
        },
        payload: function (newval: string) {
            vscode.setState({
                payload: newval,
                launchConfig: this.launchConfig,
            })
        },
    },
    methods: {
        launch() {
            let payloadJson: { [k: string]: any } = {}
            if (this.payload !== '') {
                try {
                    payloadJson = JSON.parse(this.payload)
                } catch (e) {
                    // swallow error for now...
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
            let payloadJson: { [k: string]: any } = {}
            if (this.payload !== '') {
                try {
                    payloadJson = JSON.parse(this.payload)
                } catch (e) {
                    // swallow error for now...
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
            vscode.postMessage({
                command: 'loadSamLaunchConfig',
            })
        },
        loadPayload() {
            vscode.postMessage({
                command: 'getSamplePayload',
            })
        },
        loadResource() {
            vscode.postMessage({
                command: 'getTemplate',
            })
        },
    },
    // `createElement` is inferred, but `render` needs return type
    template: `<!--
    * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
    * SPDX-License-Identifier: Apache-2.0
    -->
   
    <!--This is an experimental template that is not used directly.  -->
   
   <template>
       <form class="invoke-lambda-form">
           <label id="form-title" for="invoke-lambda-form">Invoke Local Lambda</label><br>
           <button v-on:click.prevent="loadConfig">Load Config</button>
           <button v-on:click.prevent="loadResource">Load Resource</button><br>
           <label  for="target-type-selector">Invoke Target Type</label>
           <select  name="target-types" id="target-type-selector" v-model="launchConfig.invokeTarget.target">
               <option :value="type.value" v-for="(type, index) in targetTypes" :key="index">{{ type.name }}</option>
           </select>
           <div class="config-details">
               <div>Target type: {{ launchConfig.invokeTarget.target }}</div>
               <div class="target-code" v-if="launchConfig.invokeTarget.target === 'code'">
                   <div class="config-item">
                       <label for="select-directory">Project Root</label>
                       <button id="select-directory">Select Directory...</button>
                       <span class="data-view">the selected directory:  {{launchConfig.invokeTarget.projectRoot}}</span>
                   </div>
                   <div class="config-item">
                       <label for="lambda-handler">Lambda Handler</label>
                       <input type="text" placeholder="Enter the lambda handler" name="lambda-handler" id="lambda-handler" v-model="launchConfig.invokeTarget.lambdaHandler" /> <span class="data-view">lamda handler :{{launchConfig.invokeTarget.lambdaHandler}}</span>
                   </div>
                   <div class="config-item">
                       <label for="runtime-selector">Runtime</label>
                       <select name="runtimeType" id="target-code-runtime" v-model="launchConfig.lambda.runtime">
                           <option v-for="(runtime, index) in runtimes" v-bind:value="runtime" :key="index">{{ runtime }}</option>
                       </select>
                           <span class="data-view">runtime in data:  {{ launchConfig.lambda.runtime }}</span>
                   </div>
               </div>
               <div class="target-template" v-else-if="launchConfig.invokeTarget.target === 'template'">
                   <div class="config-item">
                       <label for="template-path">Template Path</label>
                       <button id="template-path-button">Select Template...</button><span class="data-view">Template path from data: {{launchConfig.invokeTarget.templatePath}}</span>
                       
                   </div>
                   <div class="config-item">
                       <label for="logicalID">Logical ID</label>
                       <input name="template-logical-id" id="template-logical-id"/><span class="data-view"> Logical Id from data: {{launchConfig.invokeTarget.logicalId}}</span>
                   </div>
               </div>
               <div class="target-apigw" v-else-if="launchConfig.invokeTarget.target === 'api'" >
                   <div class="config-item">
                       <label for="template-path-api">Template Path</label>
                       <button id="template-path-api-button">Select Template...</button>
                   </div>
                   <div class="config-item">
                       <label for="logicalID">Logical ID</label>
                       <textarea name="template-logical-id" id="template-logical-id" cols="15" rows="2"></textarea>
                   </div>
                   <div class="config-item">
                       <label for="http-method-selector">HTTP Method</label>
                       <select name="http-method" id="http-method-selector">
                           <option :value="method" v-for="(method, index) in httpMethods" :key="index">{{method}}</option>
                       </select>
                   </div>
                   <div class="config-item">
                       <label for="query-string">Query String</label>
                       <textarea name="query-string" id="query-string" cols="15" rows="2" placeholder="Enter a query"></textarea>
                   </div>
                   <div class="config-item">
                       <label for="">Headers</label>
                       <button id="template-path-api-button">Add Header...</button>
                   </div>
               </div>
               <div v-else>Select an Invoke Target</div>
           </div>
           <div class="payload-section">
               <h3>Payload</h3>
               <button v-on:click.prevent="loadPayload">Load Payload</button><br>
               <textarea name="lambda-payload" id="lambda-payload" cols="30" rows="10" v-model="payload"></textarea>
               <span class="data-view">payload from data: {{payload}} </span>
               <div class="invoke-button-container">
                   <button v-on:click.prevent="save">Save</button>
                   <button v-on:click.prevent="launch">Invoke</button>
               </div>
           </div>
       </form>
   </template>`,
})

new Vue({
    el: '#vueApp',
    render: (createElement): VNode => {
        return createElement(Component)
    },
})
