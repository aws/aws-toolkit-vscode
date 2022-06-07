<template id="consolasTOSTemplate">
    <div>
        <p class="amazon-confidential">Amazon confidential</p>
        <h1 class="consolas-preview-terms">Consolas Preview Terms</h1>
        <div style="width: 100%">
            <p>
                The Consolas service is provided as a ‘Beta Service’ and an ‘AI Service’ as defined in the AWS Service
                Terms. Usage of the Consolas Beta Service is governed by your Agreement with AWS and the
                <a href="https://aws.amazon.com/service-terms/">AWS Service Terms</a>, as supplemented by these
                additional terms, which are made part of Section 2 ('Betas and Previews') of the Service Terms. Any term
                undefined in these Consolas preview terms will have the meaning assigned to it in the Agreement and
                Service Terms.
            </p>
            <div>
                Before using the Consolas Beta Service, please review the Betas and Previews terms found
                <a href="https://aws.amazon.com/service-terms/">here</a>. The Consolas Beta Service uses certain
                information to provide the service, including:<br />
                <ul>
                    <li>
                        Contextual information (file content, filename, programming language, cursor location, active
                        line number);
                    </li>
                    <li>
                        Feedback (acceptance or rejection of recommendations, modifications to recommendations, user
                        settings);
                    </li>
                    <li>Telemetry metrics (latency, errors, Consolas API interactions); and</li>
                    <li>User environment information (which IDE is being used, OS information, transfer protocols).</li>
                </ul>
            </div>
            <p>
                The Consolas preview period will help us conduct key testing and research in order to improve Consolas
                and prepare it for general availability. For Your Content processed by the Consolas Beta Service (the
                “Consolas Content”), you agree and instruct that (a) we may use and store the Consolas Content to
                maintain and provide the Consolas services (including development and improvement of the Consolas
                services and underlying technology); (b) we may use and store the Consolas Content that is not personal
                data to develop and improve AWS and affiliate machine-learning and artificial-intelligence technologies;
                and (c) solely in connection with the development and improvement described in clauses (a) and (b), we
                may store the Content in an AWS region outside of the AWS region where you are using Consolas. If you
                have participated in the Consolas preview and would like Your Content deleted, please contact us at
                <a href="mailto:consolas-feedback@amazon.com">consolas-feedback@amazon.com</a>. As part of the Consolas
                preview, we may offer you the option to toggle this data sharing on or off through the Beta Service. If
                you decline data sharing through the Beta Service for an account or set of credentials, we will refrain
                from collecting the applicable Consolas Content for this purpose and will delete any of that Consolas
                Content that we have collected for this purpose.
            </p>
            <div>
                Notwithstanding any other term to the contrary in any agreement between you (or your affiliates) and
                AWS, and without limitation: <br />
                <ul>
                    <li>
                        you acknowledge that Consolas output is a computational result based on the input you provide to
                        the Beta Service, and that multiple users may receive the same or similar output. For clarity,
                        although these computational results are Your Content, the same or similar outputs are
                        independently created, and AWS will not be restricted from providing the same or similar output
                        to other customers. In addition, the Consolas Beta Service may produce computational results
                        that are attributed to AWS, and AWS retains the underlying intellectual property rights in that
                        Content;
                    </li>
                    <li>
                        if you would like to instruct AWS to refrain from using collected data for service improvement,
                        you must either: (a) submit a request at the deletion link identified in these beta terms and
                        refrain from further usage of the Consolas Beta Service; or (b) if available, leverage one or
                        more of the data sharing toggle options within the Consolas Beta Service.
                    </li>
                </ul>
            </div>
            <p>
                The Beta Service is subject to change and cancellation.
                <b>IF YOU DO NOT AGREE TO THESE TERMS AND CONDITIONS, YOU MAY NOT USE THE CONSOLAS BETA SERVICE.</b>
            </p>
        </div>
        <div class="container">
            <button type="button" id="cancel" class="block" @click="cancelCodeSuggestion">Cancel</button>
            <button type="button" id="accept" @click="acceptCodeSuggestions">
                Accept and enable consolas settings
            </button>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { ConsolasWebview } from './backend'
import { WebviewClientFactory } from '../../../webviews/client'
import saveData from '../../../webviews/mixins/saveData'
const client = WebviewClientFactory.create<ConsolasWebview>()
export default defineComponent({
    name: 'consolas',
    // This ensures that everything in `data` is persisted
    mixins: [saveData],
    // Everything relating to component state should be returned by this method
    data() {
        return {
            userInput: '',
            errorMessage: '',
            autodisabled: false,
            bindValue: 'alt+c',
        }
    },
    // Executed on component creation
    created() {
        client.onDidChangeKeyBinding(val => {
            this.bindValue = val
        })
        client.onDidChangeTriggerStatus(val => {
            this.autodisabled = val
        })
    },
    methods: {
        async acceptCodeSuggestions() {
            client.controlTrigger()
        },
        async cancelCodeSuggestion() {
            client.cancelCodeSuggestion()
        },
    },
})
</script>

<style scoped>
/* Styling specific this component can be placed here */
.container {
    display: flex;
    flex-direction: row;
    column-gap: 2em;
    justify-content: flex-end;
    padding-bottom: 1em;
    background-color: transparent;
}
.block {
    background-color: #464e57;
}
.block:hover {
    background-color: transparent;
}
#event-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
}
.binding-style {
    font-weight: 700;
    color: #1e90ff;
}
#cancel,
#accept {
    display: block;
}

.button-right {
    float: right;
}
.amazon-confidential {
    text-align: right;
    font-weight: bold;
}
.consolas-preview-terms {
    text-align: center;
    font-weight: bold;
    text-decoration-line: underline;
}
</style>
