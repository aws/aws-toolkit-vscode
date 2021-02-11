/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import Vue, { VNode } from 'vue'
import { AwsSamDebuggerConfiguration } from '../../shared/sam/debugger/awsSamDebugConfiguration'
import { VsCode } from '../../webviews/main'
import { SamInvokerRequest, SamInvokerResponse } from './samInvoke'

declare const vscode: VsCode<SamInvokerRequest, any>

interface Data {
    msg: any
    launchConfig: AwsSamDebuggerConfiguration
}

export const Component = Vue.extend({
    created() {
        window.addEventListener('message', ev => {
            const event = ev.data as SamInvokerResponse
            switch (event.command) {
                case 'getSamplePayload':
                    this.msg = event.data.payload
                    break
                case 'getTemplate':
                    this.msg = `${event.data.template} ${event.data.logicalId}`
                    break
                case 'loadSamLaunchConfig':
                    this.msg = `${event.data.launchConfig.name} ${event.data.launchConfig.type} ${event.data.launchConfig.invokeTarget}`
                    break
            }
        })
    },
    data(): Data {
        return {
            msg: 'Hello',
            launchConfig: {
                type: 'aws-sam',
                request: 'direct-invoke',
                name: 'testapp:HelloWorldFunction (nodejs12.x)',
                invokeTarget: {
                    target: 'template',
                    templatePath: 'testapp/template.yaml',
                    logicalId: 'HelloWorldFunction',
                },
                lambda: {
                    payload: {},
                    environmentVariables: {},
                    runtime: 'nodejs12.x',
                },
            },
        }
    },
    methods: {
        launch() {
            vscode.postMessage({
                // command: 'saveLaunchConfig',
                command: 'invokeLaunchConfig',
                data: {
                    launchConfig: this.launchConfig,
                },
            })
        },
        save() {
            vscode.postMessage({
                command: 'saveLaunchConfig',
                // command: 'invokeLaunchConfig',
                data: {
                    launchConfig: this.launchConfig,
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
    template: `<div> {{ this.msg }} </nbsp>
            <button v-on:click="launch">Invoke</button>
            <button v-on:click="save">Save</button>
            <button v-on:click="loadConfig">Load Config</button>
            <button v-on:click="loadPayload">Load Payload</button>
            <button v-on:click="loadResource">Load Resource</button>
        </div>`,
})

new Vue({
    el: '#vueApp',
    render: (createElement): VNode => {
        return createElement(Component)
    },
})
