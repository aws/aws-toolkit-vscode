console.log('Loaded!')
;(function() {
    const vscode = acquireVsCodeApi()
    const app = new Vue({
        el: '#app',
        data: {
            selectedApiResource: '',
            selectedMethod: '',
            methods: [],
            jsonInput: '',
            queryString: '',
            errors: [],
            isLoading: false,
            localizedMessages: {
                noApiResource: 'noApiResource',
                noMethod: 'noMethod',
            },
        },
        mounted() {
            this.$nextTick(function() {
                window.addEventListener('message', this.handleMessageReceived)
            })
        },
        methods: {
            handleMessageReceived: function(e) {
                const message = event.data
                console.log(message.command)
                switch (message.command) {
                    case 'setMethods':
                        this.methods = message.methods
                        if (this.methods) {
                            this.selectedMethod = this.methods[0]
                        }
                        break
                    case 'setLocalizedMessages':
                        this.localizedMessages = message.localizedMessages
                        break
                    case 'invokeApiStarted':
                        this.isLoading = true
                        break
                    case 'invokeApiFinished':
                        this.isLoading = false
                        break
                }
            },
            setApiResource: function() {
                vscode.postMessage({
                    command: 'apiResourceSelected',
                    value: this.selectedApiResource,
                })
            },
            sendInput: function() {
                this.errors = []
                if (!this.selectedApiResource) {
                    this.errors.push(this.localizedMessages.noApiResource)
                }
                if (!this.selectedMethod) {
                    this.errors.push(this.localizedMessages.noMethod)
                }
                if (this.errors.length > 0) {
                    return
                }

                console.log(this.jsonInput)
                vscode.postMessage({
                    command: 'invokeApi',
                    body: this.jsonInput,
                    selectedApiResource: this.selectedApiResource,
                    selectedMethod: this.selectedMethod,
                    queryString: this.queryString,
                })
            },
        },
    })
})()
