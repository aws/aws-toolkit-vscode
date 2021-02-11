/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import Vue, { VNode } from 'vue'
import { AwsSamDebuggerConfiguration } from '../../shared/sam/debugger/awsSamDebugConfiguration'
import { VsCode } from '../../webviews/main'
import { SamInvokerRequest } from './samInvoke'

declare const vscode: VsCode<SamInvokerRequest, any>

interface Data {
    msg: string
    launchConfig: AwsSamDebuggerConfiguration
}

export const Component = Vue.extend({
    created() {
        window.addEventListener('message', ev => {
            const data = ev.data
            this.msg = data.newText
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
        // need annotation due to `this` in return type
        greet(): string {
            return this.msg + ' world'
        },
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
    },
    computed: {
        // need annotation
        greeting(): string {
            return this.greet() + '!'
        },
    },
    // `createElement` is inferred, but `render` needs return type
    template:
        '<div> {{ this.greeting }} <button v-on:click="launch">Invoke</button> <button v-on:click="save">Save</button> </div>',
})

new Vue({
    el: '#vueApp',
    render: (createElement): VNode => {
        return createElement(Component)
    },
})
