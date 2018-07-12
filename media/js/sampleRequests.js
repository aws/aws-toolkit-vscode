console.log('Loaded!');
(function () {
    const vscode = acquireVsCodeApi();
    const app = new Vue({
        el: '#app',
        data: {
            selectedSampleRequest: {},
            sampleText: ""
        },
        mounted() {
            this.$nextTick(function () {
                window.addEventListener('message', this.handleMessageReceived);
            })
        },
        methods: {
            newSelection: function () {
                vscode.postMessage({
                    command: 'sampleRequestSelected',
                    value: this.selectedSampleRequest
                })
            },
            handleMessageReceived: function (e) {
                const message = event.data;
                console.log(message.command);
                console.log(message.sample);
                switch (message.command) {
                    case 'loadedSample':
                        this.loadSampleText(message.sample);
                        break;
                }
            },
            loadSampleText: function (txt) {
                this.sampleText = txt;
            },
            sendInput: function() {
                console.log(this.sampleText);
                vscode.postMessage({
                    command: 'invokeLambda',
                    value: this.sampleText
                })
            }
        }
    });
})();