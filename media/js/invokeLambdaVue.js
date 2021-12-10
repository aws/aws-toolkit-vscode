console.log('Loaded!')
;(function () {
    const vscode = acquireVsCodeApi()
    const app = Vue.createApp({
        data: () => ({
            selectedSampleRequest: {},
            sampleText: '',
            error: null,
            payload: {},
            statusCode: '',
            logs: '',
            showResponse: false,
            isLoading: false,
            selectedFile: '',
        }),
        mounted() {
            this.$nextTick(function () {
                window.addEventListener('message', this.handleMessageReceived)
            })
        },
        methods: {
            newSelection: function () {
                vscode.postMessage({
                    command: 'sampleRequestSelected',
                    value: this.selectedSampleRequest,
                })
            },
            promptForFileLocation: function () {
                vscode.postMessage({
                    command: 'promptForFile',
                })
            },
            handleMessageReceived: function (e) {
                const message = event.data
                console.log(message.command)
                console.log(message.sample)
                switch (message.command) {
                    case 'loadedSample':
                        this.loadSampleText(message.sample)
                        this.selectedFile = message.selectedFile
                        break
                    case 'invokedLambda':
                        this.showResponse = true
                        this.error = ''
                        this.payload = ''
                        this.statusCode = ''
                        this.logs = ''
                        if (message.error) {
                            this.error = message.error
                        } else {
                            let parsed
                            try {
                                parsed = JSON.parse(message.payload)
                            } catch (e) {
                                parsed = message.payload
                            }
                            this.payload = parsed
                            this.statusCode = message.statusCode
                            this.logs = message.logs
                        }
                        this.isLoading = false
                        break
                }
            },
            loadSampleText: function (txt) {
                this.sampleText = txt
            },
            sendInput: function () {
                console.log(this.sampleText)
                this.isLoading = true
                vscode.postMessage({
                    command: 'invokeLambda',
                    value: this.sampleText,
                })
            },
        },
    })
    app.mount('#app')
})()
