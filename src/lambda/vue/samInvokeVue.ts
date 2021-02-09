/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import Vue, { VNode } from 'vue'
import { VsCode } from '../../webviews/main'
import { BackendToFrontend, FrontendToBackend } from './samInvoke'

declare const vscode: VsCode<FrontendToBackend, any>

export const Component = Vue.extend({
    created() {
        window.addEventListener('message', ev => {
            const data = ev.data as BackendToFrontend
            this.msg = data.newText
        })
    },
    data() {
        return {
            msg: 'Hello',
        }
    },
    methods: {
        // need annotation due to `this` in return type
        greet(): string {
            return this.msg + ' world'
        },
        alertBackend() {
            vscode.postMessage({ messageText: 'hello world' })
        },
    },
    computed: {
        // need annotation
        greeting(): string {
            return this.greet() + '!'
        },
    },
    // `createElement` is inferred, but `render` needs return type
    template: '<div> {{ this.greeting }} <button v-on:click="alertBackend">Click me!</button> </div>',
})

new Vue({
    el: '#vueApp',
    render: (createElement): VNode => {
        return createElement(Component)
    },
})
