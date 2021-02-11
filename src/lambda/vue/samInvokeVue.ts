/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import Vue, { VNode } from 'vue'
import { AwsSamDebuggerConfiguration } from '../../shared/sam/debugger/awsSamDebugConfiguration'
import { VsCode } from '../../webviews/main'
import { SamInvokerRequest, SamInvokerResponse } from './samInvoke'

declare const vscode: VsCode<SamInvokerRequest, Data>

interface Data {
    msg: any
    launchConfig: MorePermissiveAwsSamDebuggerConfiguration
}
interface MorePermissiveAwsSamDebuggerConfiguration extends AwsSamDebuggerConfiguration {
    invokeTarget: {
        target: 'template' | 'api' | 'code'
        templatePath: string
        logicalId: string
        lambdaHandler: string
        projectRoot: string
    }
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
            payload: {},
            environmentVariables: {},
            runtime: '',
        },
    }
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
                    this.launchConfig = event.data.launchConfig as MorePermissiveAwsSamDebuggerConfiguration
                    this.msg = `Loaded config ${event.data.launchConfig.name}`
                    break
            }
        })
    },
    data(): Data {
        return {
            msg: 'Hello',
            launchConfig: newLaunchConfig(),
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
    template: `<div> {{ this.launchConfig.invokeTarget.projectRoot }} <nbsp />
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
