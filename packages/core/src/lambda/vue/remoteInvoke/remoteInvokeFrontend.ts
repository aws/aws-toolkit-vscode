/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Disable because it is a front-end file.
/* eslint-disable aws-toolkits/no-console-log */

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
    FunctionMap: [],
    TestEvents: [],
    FunctionStack: '',
    Source: '',
}

export default defineComponent({
    async created() {
        this.initialData = (await client.init()) ?? this.initialData
        if (this.initialData.FunctionArn && this.initialData.FunctionRegion) {
            this.initialData.TestEvents = await client.listRemoteTestEvents(
                this.initialData.FunctionArn,
                this.initialData.FunctionRegion
            )
        }
    },

    data(): RemoteInvokeData {
        return {
            initialData: { ...defaultInitialData },
            selectedSampleRequest: '',
            sampleText: '{}',
            selectedFile: '',
            selectedFilePath: '',
            payload: 'sampleEvents',
            selectedTestEvent: '',
            showNameInput: false,
            newTestEventName: '',
            selectedFunction: 'selectedFunction',
        }
    },
    methods: {
        async newSelection() {
            const eventData = {
                name: this.selectedTestEvent,
                region: this.initialData.FunctionRegion,
                arn: this.initialData.FunctionArn,
            }
            const resp = await client.getRemoteTestEvents(eventData)
            this.sampleText = JSON.stringify(JSON.parse(resp), undefined, 4)
        },
        async saveEvent() {
            const eventData = {
                name: this.newTestEventName,
                event: this.sampleText,
                region: this.initialData.FunctionRegion,
                arn: this.initialData.FunctionArn,
            }
            await client.createRemoteTestEvents(eventData)
            this.showNameInput = false
            this.newTestEventName = ''
            this.selectedTestEvent = eventData.name
            this.initialData.TestEvents = await client.listRemoteTestEvents(
                this.initialData.FunctionArn,
                this.initialData.FunctionRegion
            )
        },
        async promptForFileLocation() {
            const resp = await client.promptFile()
            if (resp) {
                this.selectedFile = resp.selectedFile
                this.selectedFilePath = resp.selectedFilePath
            }
        },
        onFileChange(event: Event) {
            const input = event.target as HTMLInputElement
            if (input.files && input.files.length > 0) {
                const file = input.files[0]
                this.selectedFile = file.name

                // Use Blob.text() to read the file as text
                file.text()
                    .then((text) => {
                        this.sampleText = text
                    })
                    .catch((error) => {
                        console.error('Error reading file:', error)
                    })
            }
        },
        showNameField() {
            if (this.initialData.FunctionRegion || this.initialData.FunctionRegion) {
                this.showNameInput = true
            }
        },

        async sendInput() {
            let event = ''

            if (this.payload === 'sampleEvents' || this.payload === 'savedEvents') {
                event = this.sampleText
            } else if (this.payload === 'localFile') {
                if (this.selectedFile && this.selectedFilePath) {
                    const resp = await client.loadFile(this.selectedFilePath)
                    if (resp) {
                        event = resp.sample
                    }
                }
            }
            await client.invokeLambda(event, this.initialData.Source)
        },

        loadSampleEvent() {
            client.getSamplePayload().then(
                (sample) => {
                    if (!sample) {
                        return
                    }
                    this.sampleText = JSON.stringify(JSON.parse(sample), undefined, 4)
                },
                (e) => {
                    console.error('client.getSamplePayload failed: %s', (e as Error).message)
                }
            )
        },

        async loadRemoteTestEvents() {
            const shouldLoadEvents =
                this.payload === 'savedEvents' &&
                this.initialData.FunctionArn &&
                this.initialData.FunctionRegion &&
                !this.initialData.TestEvents

            if (shouldLoadEvents) {
                this.initialData.TestEvents = await client.listRemoteTestEvents(
                    this.initialData.FunctionArn,
                    this.initialData.FunctionRegion
                )
            }
        },
    },
    mixins: [saveData],
})
