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
    LambdaFunctionNode: undefined,
    supportCodeDownload: true,
    runtimeSupportsRemoteDebug: true,
    remoteDebugLayer: '',
}

export default defineComponent({
    data(): RemoteInvokeData {
        return {
            initialData: { ...defaultInitialData },
            debugConfig: {
                debugPort: 9229,
                localRootPath: '',
                remoteRootPath: '/var/task',
                shouldPublishVersion: true,
                lambdaTimeout: 900,
                otherDebugParams: '',
            },
            debugState: {
                isDebugging: false,
                debugTimer: undefined,
                debugTimeRemaining: 60,
                showDebugTimer: false,
                handlerFileAvailable: false,
                remoteDebuggingEnabled: false,
            },
            runtimeSettings: {
                sourceMapEnabled: true,
                skipFiles: '/var/runtime/node_modules/**/*.js,<node_internals>/**',
                justMyCode: true,
                projectName: '',
                outFiles: undefined,
            },
            uiState: {
                isCollapsed: true,
                showNameInput: false,
                payload: 'sampleEvents',
            },
            payloadData: {
                selectedSampleRequest: '',
                sampleText: '{}',
                selectedFile: '',
                selectedFilePath: '',
                selectedTestEvent: '',
                newTestEventName: '',
            },
        }
    },

    async created() {
        // Initialize data from backend
        this.initialData = (await client.init()) ?? this.initialData
        this.debugConfig.localRootPath = this.initialData.LocalRootPath ?? ''

        // Register for state change events from the backend
        void client.onStateChange(async () => {
            await this.syncStateFromWorkspace()
        })

        // Check for existing session state and load it
        await this.syncStateFromWorkspace()
    },

    computed: {
        // Auto-adjust textarea rows based on content
        textareaRows(): number {
            if (!this.payloadData.sampleText) {
                return 5 // Default minimum rows
            }

            // Count line breaks to determine basic row count
            const lineCount = this.payloadData.sampleText.split('\n').length
            let additionalLine = 0
            for (const line of this.payloadData.sampleText.split('\n')) {
                if (line.length > 60) {
                    additionalLine += Math.floor(line.length / 60)
                }
            }

            // Use the larger of line count or estimated lines, with min 5 and max 20
            const calculatedRows = lineCount + additionalLine
            return Math.max(5, Math.min(50, calculatedRows))
        },

        // Validation computed properties
        debugPortError(): string {
            if (this.debugConfig.debugPort !== null && this.debugConfig.debugPort !== undefined) {
                const port = Number(this.debugConfig.debugPort)
                if (isNaN(port) || port < 1 || port > 65535) {
                    return 'Debug port must be between 1 and 65535'
                }
            }
            return ''
        },

        otherDebugParamsError(): string {
            if (this.debugConfig.otherDebugParams && this.debugConfig.otherDebugParams.trim() !== '') {
                try {
                    JSON.parse(this.debugConfig.otherDebugParams)
                } catch (error) {
                    return 'Other Debug Params must be a valid JSON object'
                }
            }
            return ''
        },

        lambdaTimeoutError(): string {
            if (this.debugConfig.lambdaTimeout !== undefined) {
                const timeout = Number(this.debugConfig.lambdaTimeout)
                if (isNaN(timeout) || timeout < 1 || timeout > 900) {
                    return 'Timeout override must be between 1 and 900 seconds'
                }
            }
            return ''
        },

        // user can override the default provided layer and bring their own layer
        // this is useful to support function with code signing config
        lambdaLayerError(): string {
            if (this.initialData.remoteDebugLayer && this.initialData.remoteDebugLayer.trim() !== '') {
                const layerArn = this.initialData.remoteDebugLayer.trim()

                // Validate Lambda layer ARN format
                // Expected format: arn:aws:lambda:region:account-id:layer:layer-name:version
                const layerArnRegex = /^arn:aws:lambda:[a-z0-9-]+:\d{12}:layer:[a-zA-Z0-9-_]+:\d+$/

                if (!layerArnRegex.test(layerArn)) {
                    return 'Layer ARN must be in the format: arn:aws:lambda:<region>:<account-id>:layer:<layer-name>:<version>'
                }

                // Extract region from ARN to validate it matches the function region
                const arnParts = layerArn.split(':')
                if (arnParts.length >= 4) {
                    const layerRegion = arnParts[3]
                    if (this.initialData.FunctionRegion && layerRegion !== this.initialData.FunctionRegion) {
                        return `Layer region (${layerRegion}) must match function region (${this.initialData.FunctionRegion})`
                    }
                }
            }
            return ''
        },
    },

    methods: {
        // Runtime detection computed properties based on the runtime string
        hasRuntimePrefix(prefix: string): boolean {
            const runtime = this.initialData.Runtime || ''
            return runtime.startsWith(prefix)
        },
        // Sync state from workspace storage
        async syncStateFromWorkspace() {
            try {
                // Update debugging state
                this.debugState.isDebugging = await client.isWebViewDebugging()
                this.debugConfig.localRootPath = await client.getLocalPath()
                this.debugState.handlerFileAvailable = await client.getHandlerAvailable()
                // Get current session state

                if (this.debugState.isDebugging) {
                    // Update invoke button state based on session
                    const isInvoking = await client.getIsInvoking()

                    // If debugging is active and we're not showing the timer,
                    // calculate and show remaining time
                    this.clearDebugTimer()
                    if (this.debugState.isDebugging && !isInvoking) {
                        await this.startDebugTimer()
                    }
                } else {
                    this.clearDebugTimer()
                    // no debug session
                }
            } catch (error) {
                console.error('Failed to sync state from workspace:', error)
            }
        },
        async newSelection() {
            const eventData = {
                name: this.payloadData.selectedTestEvent,
                region: this.initialData.FunctionRegion,
                arn: this.initialData.FunctionArn,
            }
            const resp = await client.getRemoteTestEvents(eventData)
            this.payloadData.sampleText = JSON.stringify(JSON.parse(resp), undefined, 4)
        },
        async saveEvent() {
            const eventData = {
                name: this.payloadData.newTestEventName,
                event: this.payloadData.sampleText,
                region: this.initialData.FunctionRegion,
                arn: this.initialData.FunctionArn,
            }
            await client.createRemoteTestEvents(eventData)
            this.uiState.showNameInput = false
            this.payloadData.newTestEventName = ''
            this.payloadData.selectedTestEvent = eventData.name
            this.initialData.TestEvents = await client.listRemoteTestEvents(
                this.initialData.FunctionArn,
                this.initialData.FunctionRegion
            )
        },
        async promptForFileLocation() {
            const resp = await client.promptFile()
            if (resp) {
                this.payloadData.selectedFile = resp.selectedFile
                this.payloadData.selectedFilePath = resp.selectedFilePath
            }
        },
        async promptForFolderLocation() {
            const resp = await client.promptFolder()
            if (resp) {
                this.debugConfig.localRootPath = resp
                this.debugState.handlerFileAvailable = await client.getHandlerAvailable()
            }
        },

        onFileChange(event: Event) {
            const input = event.target as HTMLInputElement
            if (input.files && input.files.length > 0) {
                const file = input.files[0]
                this.payloadData.selectedFile = file.name

                // Use Blob.text() to read the file as text
                file.text()
                    .then((text) => {
                        this.payloadData.sampleText = text
                    })
                    .catch((error) => {
                        console.error('Error reading file:', error)
                    })
            }
        },
        async debugPreCheck() {
            if (!this.debugState.remoteDebuggingEnabled) {
                // don't check if unchecking
                this.debugState.remoteDebuggingEnabled = false
                if (this.debugState.isDebugging) {
                    await client.stopDebugging()
                }
            } else {
                // check when user is checking box
                this.debugState.remoteDebuggingEnabled = await client.debugPreCheck()
                this.debugConfig.localRootPath = await client.getLocalPath()
                this.debugState.handlerFileAvailable = await client.getHandlerAvailable()
            }
        },
        showNameField() {
            if (this.initialData.FunctionRegion || this.initialData.FunctionRegion) {
                this.uiState.showNameInput = true
            }
        },

        async sendInput() {
            // Tell the backend to set the button state. This state is maintained even if webview loses focus
            if (this.debugState.remoteDebuggingEnabled) {
                // check few outof bound issue
                if (
                    this.debugConfig.lambdaTimeout &&
                    (this.debugConfig.lambdaTimeout > 900 || this.debugConfig.lambdaTimeout < 0)
                ) {
                    this.debugConfig.lambdaTimeout = 900
                }
                if (
                    this.debugConfig.debugPort &&
                    (this.debugConfig.debugPort > 65535 || this.debugConfig.debugPort <= 0)
                ) {
                    this.debugConfig.debugPort = 9229
                }

                // acquire invoke lock
                if (this.debugState.remoteDebuggingEnabled && !(await client.checkReadyToInvoke())) {
                    return
                }

                if (!this.debugState.isDebugging) {
                    this.debugState.isDebugging = await client.startDebugging({
                        functionArn: this.initialData.FunctionArn,
                        functionName: this.initialData.FunctionName,
                        port: this.debugConfig.debugPort ?? 9229,
                        sourceMap: this.runtimeSettings.sourceMapEnabled,
                        localRoot: this.debugConfig.localRootPath,
                        shouldPublishVersion: this.debugConfig.shouldPublishVersion,
                        remoteRoot:
                            this.debugConfig.remoteRootPath !== '' ? this.debugConfig.remoteRootPath : '/var/task',
                        skipFiles: (this.runtimeSettings.skipFiles !== ''
                            ? this.runtimeSettings.skipFiles
                            : '<node_internals>/**'
                        ).split(','),
                        justMyCode: this.runtimeSettings.justMyCode,
                        projectName: this.runtimeSettings.projectName,
                        otherDebugParams: this.debugConfig.otherDebugParams,
                        layerArn: this.initialData.remoteDebugLayer,
                        lambdaTimeout: this.debugConfig.lambdaTimeout ?? 900,
                        outFiles: this.runtimeSettings.outFiles?.split(','),
                    })
                    if (!this.debugState.isDebugging) {
                        // user cancel or failed to start debugging
                        return
                    }
                }
                this.debugState.showDebugTimer = false
            }

            let event = ''

            if (this.uiState.payload === 'sampleEvents' || this.uiState.payload === 'savedEvents') {
                event = this.payloadData.sampleText
            } else if (this.uiState.payload === 'localFile') {
                if (this.payloadData.selectedFile && this.payloadData.selectedFilePath) {
                    const resp = await client.loadFile(this.payloadData.selectedFilePath)
                    if (resp) {
                        event = resp.sample
                    }
                }
            }

            await client.invokeLambda(event, this.initialData.Source, this.debugState.remoteDebuggingEnabled)
            await this.syncStateFromWorkspace()
        },

        async removeDebugSetup() {
            this.debugState.isDebugging = await client.stopDebugging()
        },

        async startDebugTimer() {
            this.debugState.debugTimeRemaining = await client.getDebugTimeRemaining()
            if (this.debugState.debugTimeRemaining <= 0) {
                return
            }
            this.debugState.showDebugTimer = true
            this.debugState.debugTimer = window.setInterval(() => {
                this.debugState.debugTimeRemaining--
                if (this.debugState.debugTimeRemaining <= 0) {
                    this.clearDebugTimer()
                }
            }, 1000) as number | undefined
        },

        clearDebugTimer() {
            if (this.debugState.debugTimer) {
                window.clearInterval(this.debugState.debugTimer)
                this.debugState.debugTimeRemaining = 0
                this.debugState.debugTimer = undefined
                this.debugState.showDebugTimer = false
            }
        },

        toggleCollapsible() {
            this.uiState.isCollapsed = !this.uiState.isCollapsed
        },

        async openHandler() {
            await client.tryOpenHandlerFile()
        },

        async openHandlerWithDelay() {
            const preValue = this.debugConfig.localRootPath
            // user is inputting the dir, only try to open dir if user stopped typing for 1 second
            await new Promise((resolve) => setTimeout(resolve, 1000))
            if (preValue !== this.debugConfig.localRootPath) {
                return
            }
            // try open if user stop input for 1 second
            await client.tryOpenHandlerFile(this.debugConfig.localRootPath)
            this.debugState.handlerFileAvailable = await client.getHandlerAvailable()
        },

        async downloadRemoteCode() {
            try {
                const path = await client.downloadRemoteCode()
                if (path) {
                    this.debugConfig.localRootPath = path
                    this.debugState.handlerFileAvailable = await client.getHandlerAvailable()
                }
            } catch (error) {
                console.error('Failed to download remote code:', error)
            }
        },

        loadSampleEvent() {
            client.getSamplePayload().then(
                (sample) => {
                    if (!sample) {
                        return
                    }
                    this.payloadData.sampleText = JSON.stringify(JSON.parse(sample), undefined, 4)
                },
                (e) => {
                    console.error('client.getSamplePayload failed: %s', (e as Error).message)
                }
            )
        },

        async loadRemoteTestEvents() {
            const shouldLoadEvents =
                this.uiState.payload === 'savedEvents' &&
                this.initialData.FunctionArn &&
                this.initialData.FunctionRegion

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
