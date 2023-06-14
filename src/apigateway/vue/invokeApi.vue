/*! * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */

<template>
    <div id="app">
        <div class="container button-container" style="justify-content: space-between">
            <h1>API: {{ initialData.ApiName }} ({{ initialData.ApiId }})</h1>
            <div v-if="errors.length">
                <b>Validation error(s):</b>
                <ul>
                    <li v-for="error in errors" :key="error">{{ error }}</li>
                </ul>
            </div>
            <div>
                <button class="" @click="sendInput" :disabled="isLoading">{{ invokeText }}</button>
            </div>
        </div>
        <pre>{{ initialData.ApiArn }}</pre>
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
        <textarea style="width: 100%; margin-bottom: 10px" rows="10" cols="90" v-model="jsonInput"></textarea>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../webviews/client'
import saveData from '../../webviews/mixins/saveData'
import { InvokeRemoteRestApiInitialData, RemoteRestInvokeWebview } from './invokeRemoteRestApi'

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
        this.initialData = (await client.init()) ?? this.initialData
    },
    methods: {
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
    computed: {
        invokeText() {
            return this.isLoading ? 'Invoking...' : 'Invoke'
        },
    },
})
</script>
