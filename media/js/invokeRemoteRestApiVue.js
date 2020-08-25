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
        },
        mounted() {
            this.$nextTick(function() {
                window.addEventListener('message', this.handleMessageReceived)
            })
        },
        methods: {
            setApiResource: function() {
                vscode.postMessage({
                    command: 'apiResourceSelected',
                    value: this.selectedApiResource,
                })
            },
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
                    case 'invokeApiStarted':
                        this.isLoading = true
                        break
                    case 'invokeApiFinished':
                        this.isLoading = false
                        break
                }
            },
            sendInput: function() {
                this.errors = []
                if (!this.selectedApiResource && !this.selectedMethod) {
                    if (!this.selectedApiResource) {
                        this.errors.push('Please select an API resource')
                    }
                    if (!this.selectedMethod) {
                        this.errors.push('Please select a HTTP method')
                    }
                    return
                }

                console.log(this.jsonInput)
                vscode.postMessage({
                    command: 'invokeApi',
                    value: this.jsonInput,
                    selectedApiResource: this.selectedApiResource,
                    selectedMethod: this.selectedMethod,
                    queryString: this.queryString,
                })
            },
        },
    })
})()
