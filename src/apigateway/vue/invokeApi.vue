/*! * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */

<template>
    <h1>Invoke methods on {{ initialData.ApiName }} ({{ initialData.ApiId }})</h1>
    <pre>{{ initialData.ApiArn }}</pre>
    <br />
    <div id="app">
        <h3>Select a resource:</h3>
        <select v-model="selectedApiResource" v-on:change="setApiResource">
            <option disabled value="">Select a resource</option>
            <option
                v-for="resource in initialData.Resources"
                :key="resource.id"
                :disabled="!resource.resourceMethods"
                :value="resource.id"
            >
                {{ `${resource.path}${resource.resourceMethods === undefined ? ' -- No methods' : ''}` }}
            </option>
        </select>
        <h3>Select a method:</h3>
        <select v-if="selectedApiResource" v-model="selectedMethod">
            <option disabled value="">Select a method</option>
            <option v-for="method in methods" :key="method" :value="method">
                {{ method }}
            </option>
        </select>
        <select v-else>
            <option disabled value="">Select a resource first</option>
        </select>
        <br />
        <h3>Query string (optional)</h3>
        <input type="text" v-model="queryString" />
        <br />
        <br />
        <textarea rows="20" cols="90" v-model="jsonInput"></textarea>
        <br />
        <input type="submit" v-on:click="sendInput" value="Invoke" :disabled="isLoading" />
        <br />
        <div v-if="errors.length">
            <b>Please correct the following error(s):</b>
            <ul>
                <li v-for="error in errors" :key="error">{{ error }}</li>
            </ul>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../webviews/client'
import saveData from '../../webviews/mixins/saveData'
import { InvokeRemoteRestApiInitialData, RemoteRestInvokeWebview } from '../commands/invokeRemoteRestApi'

const client = WebviewClientFactory.create<RemoteRestInvokeWebview>()

const defaultInitialData: InvokeRemoteRestApiInitialData = {
    ApiName: '',
    ApiId: '',
    ApiArn: '',
    Resources: {},
    Region: '',
    localizedMessages: {
        noApiResource: 'noApiResource',
        noMethod: 'noMethod',
    },
}

export default defineComponent({
    mixins: [saveData],
    data: () => ({
        initialData: defaultInitialData,
        selectedApiResource: '',
        selectedMethod: '',
        methods: [] as string[],
        jsonInput: '',
        queryString: '',
        errors: [] as string[],
        isLoading: false,
    }),
    async created() {
        this.initialData = (await client.getData()) ?? this.initialData
    },
    mounted() {
        this.$nextTick(function () {
            window.addEventListener('message', this.handleMessageReceived)
        })
    },
    methods: {
        handleMessageReceived: function (event: any) {
            const message = event.data
            switch (message.command) {
                case 'setMethods':
                    this.methods = message.methods
                    if (this.methods) {
                        this.selectedMethod = this.methods[0]
                    }
                    break
                case 'invokeApiStarted':
                    this.isLoading = true
                    break
                case 'invokeApiFinished':
                    this.isLoading = false
                    break
            }
        },
        setApiResource: async function () {
            const methods = await client.listValidMethods(this.initialData.Resources[this.selectedApiResource])
            this.methods = methods
            this.selectedMethod = methods[0]
        },
        sendInput: function () {
            this.errors = []
            if (!this.selectedApiResource) {
                this.errors.push(this.initialData.localizedMessages.noApiResource)
            }
            if (!this.selectedMethod) {
                this.errors.push(this.initialData.localizedMessages.noMethod)
            }
            if (this.errors.length > 0) {
                return
            }

            this.isLoading = true
            client
                .invokeApi({
                    body: this.jsonInput,
                    api: this.initialData.ApiId,
                    selectedApiResource: this.initialData.Resources[this.selectedApiResource],
                    selectedMethod: this.selectedMethod,
                    queryString: this.queryString,
                    region: this.initialData.Region,
                })
                .finally(() => (this.isLoading = false))
        },
    },
})
</script>
