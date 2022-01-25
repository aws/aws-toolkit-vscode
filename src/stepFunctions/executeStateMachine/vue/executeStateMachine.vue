/*! * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */

<template>
    <h1>Start Execution: {{ initialData.StateMachineName }}</h1>
    <div id="app">
        <div>
            <label class="input-header"> Execution Input </label>
        </div>
        <br />
        <div>
            <input type="radio" v-model="inputChoice" value="textarea" checked />
            <label for="textarea"> Provide JSON </label>
        </div>
        <div>
            <input type="radio" v-model="inputChoice" value="file" />
            <label for="file"> Select a file </label>
            <br />
            <br />
            <div :style="{ visibility: fileInputVisible ? 'visible' : 'hidden' }">
                <label class="custom-file-upload">
                    <input type="file" @change="processFile($event)" />
                    Choose File
                </label>
                <span class="custom-file-name">{{ selectedFile }}</span>
            </div>
        </div>
        <br />
        <br />
        <div :style="{ visibility: textAreaVisible ? 'visible' : 'hidden' }">
            <textarea
                rows="10"
                v-model="executionInput"
                v-bind:readonly="inputChoice == 'file'"
                v-bind:placeholder="placeholderJson"
            ></textarea>
        </div>
        <br />
        <input type="submit" v-on:click="sendInput" value="Execute" />
        <br />
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../../webviews/client'
import { ExecuteStateMachineWebview } from '../../commands/executeStateMachine'

const defaultJsonPlaceholder = '{\n\t"key1": "value1",\n\t"key2": "value2",\n\t"key3": "value3"\n}'
const client = WebviewClientFactory.create<ExecuteStateMachineWebview>()
const defaultInitialData = {
    name: '',
    region: '',
    arn: '',
}

export default defineComponent({
    // no savedata mixin: currently retains context while hidden; unsure if this is necessary.
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
        handleInputChange: function (inputType: string) {
            const self = this
            switch (inputType) {
                case 'file':
                    self.selectedFile = 'No file selected'
                    self.placeholderJson = ''
                    self.executionInput = ''
                    self.fileInputVisible = true
                    break
                case 'textarea':
                    self.placeholderJson = defaultJsonPlaceholder
                    self.executionInput = ''
                    self.fileInputVisible = false
                    break
            }
        },
        processFile: function ($event: Event) {
            console.log($event)
            console.log($event.target)
            const inputFile = $event.target as HTMLInputElement
            const self = this
            if (inputFile.files && inputFile.files.length > 0) {
                const reader = new FileReader()
                reader.onload = event => {
                    if (event.target) {
                        const result = event.target.result
                        self.executionInput = result as string
                    }
                } // desired file content
                reader.onerror = error => {
                    throw error
                }
                reader.readAsText(inputFile.files[0])
                self.selectedFile = inputFile.files[0].name
                self.textAreaVisible = true
            }
        },
        sendInput: function () {
            console.log(this.executionInput)
            client.handler({
                command: 'executeStateMachine',
                value: this.executionInput,
                arn: this.initialData.arn,
                name: this.initialData.name,
                region: this.initialData.region,
            })
        },
    },
})
</script>
