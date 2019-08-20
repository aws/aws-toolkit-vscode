console.log('Loaded!')
;(function() {
    const vscode = acquireVsCodeApi()
    const app = new Vue({
        el: '#app',
        data: {
            selectedSampleRequest: {},
            sampleText: '',
            error: null,
            payload: {},
            statusCode: '',
            logs: '',
            showResponse: false,
            isLoading: false
        },
        mounted() {
            this.$nextTick(function() {
                window.addEventListener('message', this.handleMessageReceived)
            })
        },
        methods: {
            newSelection: function() {
                vscode.postMessage({
                    command: 'sampleRequestSelected',
                    value: this.selectedSampleRequest
                })
            },
            processFile: function($event) {
                console.log($event)
                console.log($event.target)
                const inputFile = $event.target
                const self = this
                if ('files' in inputFile && inputFile.files.length > 0) {
                    const reader = new FileReader()
                    reader.onload = event => {
                        console.log(event.target.result)
                        self.sampleText = ''
                        self.sampleText = event.target.result
                    } // desired file content
                    reader.onerror = error => reject(error)
                    reader.readAsText(inputFile.files[0])
                }
            },
            handleMessageReceived: function(e) {
                const message = event.data
                console.log(message.command)
                console.log(message.sample)
                switch (message.command) {
                    case 'loadedSample':
                        this.loadSampleText(message.sample)
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
            loadSampleText: function(txt) {
                this.sampleText = txt
            },
            sendInput: function() {
                console.log(this.sampleText)
                this.isLoading = true
                vscode.postMessage({
                    command: 'invokeLambda',
                    value: this.sampleText
                })
            }
        }
    })
})()
