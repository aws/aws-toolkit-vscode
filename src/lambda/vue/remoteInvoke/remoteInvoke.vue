/*! * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */

<template>
    <div class="container button-container" style="justify-content: space-between">
        <h1>Function {{ initialData.FunctionName }}</h1>
        <div><button v-on:click="sendInput">Invoke</button></div>
    </div>

    <p style="margin-bottom: 5px; margin-top: 10px; margin-right: 5px">ARN: {{ initialData.FunctionArn }}</p>

    <p style="margin-top: 0">Region: {{ initialData.FunctionRegion }}</p>

    <h3>Select a file to use as payload:</h3>
    <div>
        <button v-on:click="promptForFileLocation">Choose File</button>
        &nbsp; {{ selectedFile }}
    </div>
    <br />
    <h3>Or, use a sample request payload from a template:</h3>
    <select v-model="selectedSampleRequest" v-on:change="newSelection">
        <option disabled value="">Select an example input</option>
        <option v-for="item in initialData.InputSamples" :key="item.name" :value="item.filename">
            {{ item.name }}
        </option>
    </select>
    <br />
    <br />
    <textarea style="width: 100%; margin-bottom: 10px" rows="10" cols="90" v-model="sampleText"></textarea>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../../webviews/client'
import saveData from '../../../webviews/mixins/saveData'
import { RemoteInvokeData, RemoteInvokeWebview } from './invokeLambda'

const client = WebviewClientFactory.create<RemoteInvokeWebview>()
const defaultInitialData = {
    FunctionName: '',
    FunctionArn: '',
    FunctionRegion: '',
    InputSamples: [],
}

export default defineComponent({
    async created() {
        this.initialData = (await client.init()) ?? this.initialData
    },
    data(): RemoteInvokeData {
        return {
            initialData: { ...defaultInitialData },
            selectedSampleRequest: '',
            sampleText: '',
            selectedFile: '',
        }
    },
    methods: {
        async newSelection() {
            const resp = await client.getSample(this.selectedSampleRequest)
            this.sampleText = resp
        },
        async promptForFileLocation() {
            const resp = await client.promptFile()
            if (resp) {
                this.sampleText = resp.sample
                this.selectedFile = resp.selectedFile
            }
        },
        sendInput() {
            client.invokeLambda(this.sampleText)
        },
    },
    mixins: [saveData],
})
</script>
