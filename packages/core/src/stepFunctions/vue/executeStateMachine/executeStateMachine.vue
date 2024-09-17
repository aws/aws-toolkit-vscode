/*! * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */

<template>
    <div id="app">
        <div class="container button-container" style="justify-content: space-between">
            <h1>{{ initialData.name }}</h1>
            <div>
                <input type="submit" v-on:click="sendInput" value="Execute" />
            </div>
        </div>
        <br />
        <div>
            <label class="input-header"> Execution Input </label>
        </div>
        <br />
        <div>
            <input type="radio" v-model="inputChoice" value="textarea" />
            <label for="textarea"> Provide JSON </label>
        </div>
        <div>
            <input type="radio" v-model="inputChoice" value="file" />
            <label for="file"> Select a file </label>
        </div>
        <div :style="{ visibility: fileInputVisible ? 'visible' : 'hidden' }">
            <br />
            <label class="custom-file-upload">
                <input type="file" @change="processFile($event)" />
                Choose File
            </label>
            <span class="custom-file-name">{{ selectedFile }}</span>
            <br />
            <br />
        </div>
        <div :style="{ visibility: textAreaVisible ? 'visible' : 'hidden' }">
            <textarea
                style="width: 100%; margin-bottom: 10px"
                rows="10"
                v-model="executionInput"
                v-bind:readonly="inputChoice == 'file'"
                v-bind:placeholder="placeholderJson"
            ></textarea>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../../webviews/client'
import saveData from '../../../webviews/mixins/saveData'
import { ExecuteStateMachineWebview } from './executeStateMachine'

const defaultJsonPlaceholder = '{\n\t"key1": "value1",\n\t"key2": "value2",\n\t"key3": "value3"\n}'
const client = WebviewClientFactory.create<ExecuteStateMachineWebview>()
const defaultInitialData = {
    name: '',
    region: '',
    arn: '',
}

export default defineComponent({
    async created() {
        this.initialData = (await client.init()) ?? this.initialData
    },
    data: () => ({
        initialData: defaultInitialData,
        executionInput: '',
        isReadOnly: false,
        inputChoice: 'textarea',
        placeholderJson: defaultJsonPlaceholder,
        selectedFile: '',
        fileInputVisible: false,
        textAreaVisible: true,
    }),
    watch: {
        inputChoice: function (newValue, oldValue) {
            this.handleInputChange(newValue)
        },
    },
    methods: {
        // TODO: move this functionality to backend?
        // combination of this and "watch" call blank the `placeholderJson` on file load
        handleInputChange: function (inputType: string) {
            switch (inputType) {
                case 'file':
                    this.selectedFile = 'No file selected'
                    this.placeholderJson = ''
                    this.executionInput = ''
                    this.fileInputVisible = true
                    break
                case 'textarea':
                    this.placeholderJson = defaultJsonPlaceholder
                    this.executionInput = ''
                    this.fileInputVisible = false
                    break
            }
        },
        processFile: function ($event: Event) {
            console.log($event)
            console.log($event.target)
            const inputFile = $event.target as HTMLInputElement
            // const self = this
            if (inputFile.files && inputFile.files.length > 0) {
                const reader = new FileReader()
                reader.onload = event => {
                    if (event.target) {
                        const result = event.target.result
                        this.executionInput = result as string
                    }
                } // desired file content
                reader.onerror = error => {
                    throw error
                }
                reader.readAsText(inputFile.files[0])
                this.selectedFile = inputFile.files[0].name
                this.textAreaVisible = true
            }
        },
        sendInput: function () {
            client.executeStateMachine(this.executionInput)
        },
    },
    mixins: [saveData],
})
</script>
