console.log('Loaded!')
;(function() {
    const vscode = acquireVsCodeApi()
    const defaultJsonPlaceholder = '{\n\t"key1": "value1",\n\t"key2": "value2",\n\t"key3": "value3"\n}'
    const app = new Vue({
        el: '#app',
        data: {
            executionInput: '',
            isReadOnly: false,
            inputChoice: 'textarea',
            placeholderJson: defaultJsonPlaceholder,
            selectedFile: '',
            fileInputVisible: false,
            textAreaVisible: true,
        },
        mounted() {
            this.$nextTick(function() {
                window.addEventListener('message', this.handleMessageReceived)
            })
        },
        watch: {
            inputChoice: function(newValue, oldValue) {
                this.handleInputChange(newValue)
            },
        },
        methods: {
            handleInputChange: function(inputType) {
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
            processFile: function($event) {
                console.log($event)
                console.log($event.target)
                const inputFile = $event.target
                const self = this
                if ('files' in inputFile && inputFile.files.length > 0) {
                    const reader = new FileReader()
                    reader.onload = event => {
                        self.executionInput = event.target.result
                    } // desired file content
                    reader.onerror = error => reject(error)
                    reader.readAsText(inputFile.files[0])
                    self.selectedFile = inputFile.files[0].name
                    self.textAreaVisible = true
                }
            },
            loadExecutionInput: function(txt) {
                this.executionInput = txt
            },
            sendInput: function() {
                console.log(this.executionInput)
                this.isLoading = true
                vscode.postMessage({
                    command: 'executeStateMachine',
                    value: this.executionInput,
                })
            },
        },
    })
})()
