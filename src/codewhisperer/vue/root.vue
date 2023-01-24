<template id="codewhispererTOSTemplate">
    <div>
        <h1 class="codewhisperer-preview-terms">Amazon CodeWhisperer Terms of Service</h1>
        <div style="width: 100%">
            <p>
                The Amazon CodeWhisperer service is provided as a 'Beta Service' and an 'AI Service' as defined in the
                AWS Service Terms. Usage of the CodeWhisperer Beta Service is governed by your Agreement with AWS and
                the
                <a href="https://aws.amazon.com/service-terms/"> AWS Service Terms</a>, as supplemented by these
                additional terms, which are made part of Section 2 ('Betas and Previews') of the Service Terms. Any term
                undefined in these CodeWhisperer preview terms will have the meaning assigned to it in the Agreement and
                Service Terms.
            </p>
            <div>
                Before using the CodeWhisperer Beta Service, please review the Betas and Previews terms found
                <a href="https://aws.amazon.com/service-terms/"> here</a>. The CodeWhisperer Beta Service uses certain
                information to provide and/or improve the service, including: <br /><br />
                <div>
                    <table class="table-bordered">
                        <tr>
                            <th>Data Type</th>
                            <th>Examples</th>
                        </tr>
                        <tr>
                            <td>Contextual information</td>
                            <td>file content, filename, programming language, cursor location, active line number</td>
                        </tr>
                        <tr>
                            <td>Feedback</td>
                            <td>
                                acceptance or rejection of recommendations, modifications to recommendations, user
                                settings
                            </td>
                        </tr>
                        <tr>
                            <td>Telemetry metrics</td>
                            <td>latency, errors, CodeWhisperer API interactions</td>
                        </tr>
                        <tr>
                            <td>User environment information</td>
                            <td>which IDE is being used, OS information, transfer protocols</td>
                        </tr>
                    </table>
                </div>
            </div>
            <br />
            <div>
                <div v-if="isCloud9">
                    <p>
                        The CodeWhisperer preview period will help us conduct key testing and research in order to
                        improve CodeWhisperer and prepare it for general availability. For Your Content processed by the
                        CodeWhisperer Beta Service (the “CodeWhisperer Content”), you agree and instruct that (a) we may
                        use and store the CodeWhisperer Content to maintain and provide the CodeWhisperer services
                        (including development and improvement of the CodeWhisperer services and underlying technology);
                        (b) we may use and store the CodeWhisperer Content that is not personal data to develop and
                        improve AWS and affiliate machine-learning and artificial-intelligence technologies; and (c)
                        solely in connection with the development and improvement described in clauses (a) and (b), we
                        may store the Content in an AWS region outside of the AWS region where you are using
                        CodeWhisperer. If you have participated in the CodeWhisperer preview and would like Your Content
                        deleted, please contact us at
                        <a href="mailto:codewhisperer@amazon.com"> this link</a>. As part of the CodeWhisperer preview,
                        we may offer you the option to toggle CodeWhisperer Content sharing on or off through the Beta
                        Service. If you decline to share CodeWhisperer Content through the Beta Service for an account
                        or set of credentials, we will refrain from collecting the applicable CodeWhisperer Content for
                        this purpose and will delete any of that CodeWhisperer Content that we have collected for this
                        purpose. This paragraph does not apply to Your Content that is processed through CodeWhisperer
                        via Lambda or Cloud9 interfaces.
                    </p>
                    <p>
                        In addition, we may offer you the option through the Beta Service to limit the collection of
                        metadata, feedback, or other usage metrics which are not CodeWhisperer Content for service
                        improvement (for example, whether a recommendation was accepted or rejected, but not the content
                        of that recommendation).
                    </p>
                </div>
                <div v-else>
                    The CodeWhisperer preview period will help us conduct key testing and research in order to improve
                    CodeWhisperer and prepare it for general availability. For Your Content processed by the
                    CodeWhisperer Beta Service (the “CodeWhisperer Content”), you agree and instruct that (a) we may use
                    and store the CodeWhisperer Content to maintain and provide the CodeWhisperer services (including
                    development and improvement of the CodeWhisperer services and underlying technology); (b) we may use
                    and store the CodeWhisperer Content that is not personal data to develop and improve AWS and
                    affiliate machine-learning and artificial-intelligence technologies; and (c) solely in connection
                    with the development and improvement described in clauses (a) and (b), we may store the Content in
                    an AWS region outside of the AWS region where you are using CodeWhisperer. If you have participated
                    in the CodeWhisperer preview and would like Your Content deleted, please contact us at
                    <a href="mailto:codewhisperer@amazon.com"> this link</a>. As part of the CodeWhisperer preview, we
                    may offer you the option to toggle CodeWhisperer Content sharing on or off through the Beta Service.
                    If you decline to share CodeWhisperer Content through the Beta Service for an account or set of
                    credentials, we will refrain from collecting the applicable CodeWhisperer Content for this purpose
                    and will delete any of that CodeWhisperer Content that we have collected for this purpose. In
                    addition, we may offer you the option through the Beta Service to limit the collection of metadata,
                    feedback, or other usage metrics which are not CodeWhisperer Content for service improvement (for
                    example, whether a recommendation was accepted or rejected, but not the content of that
                    recommendation).
                </div>
            </div>
            <br />
            <div>
                Notwithstanding any other term to the contrary in any agreement between you (or your affiliates) and
                AWS, and without limitation: <br />
                <div>
                    <div v-if="isCloud9">
                        <ul>
                            <li>
                                you acknowledge that CodeWhisperer output is a computational result based on the input
                                you provide to the Beta Service, and that multiple users may receive the same or similar
                                output. For clarity, although these computational results are Your Content, the same or
                                similar outputs are independently created, and AWS will not be restricted from providing
                                the same or similar output to other customers.
                            </li>
                            <li>
                                if you would like to instruct AWS to refrain from using collected CodeWhisperer Content
                                for service improvement, you must either: (a) submit a request at the deletion link
                                identified in these beta terms and refrain from further usage of the CodeWhisperer Beta
                                Service; or (b) if available, leverage the applicable data sharing toggle option(s)
                                within the CodeWhisperer Beta Service. This bullet point does not apply to Your Content
                                that is processed through CodeWhisperer via Lambda or Cloud9 interfaces.
                            </li>
                        </ul>
                    </div>
                    <div v-else>
                        <ul>
                            <li>
                                you acknowledge that CodeWhisperer output is a computational result based on the input
                                you provide to the Beta Service, and that multiple users may receive the same or similar
                                output. For clarity, although these computational results are Your Content, the same or
                                similar outputs are independently created, and AWS will not be restricted from providing
                                the same or similar output to other customers.
                            </li>
                            <li>
                                if you would like to instruct AWS to refrain from using collected CodeWhisperer Content
                                for service improvement, you must either: (a) submit a request at the deletion link
                                identified in these beta terms and refrain from further usage of the CodeWhisperer Beta
                                Service; or (b) if available, leverage the applicable data sharing toggle option(s)
                                within the CodeWhisperer Beta Service.
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
            <p>
                The Beta Service is subject to change and cancellation.
                <b
                    >IF YOU DO NOT AGREE TO THESE TERMS AND CONDITIONS, YOU MAY NOT USE THE CodeWhisperer BETA
                    SERVICE.</b
                >
            </p>
        </div>
        <div class="container">
            <button type="button" id="cancel" class="block" @click="cancelCodeSuggestion">Reject</button>
            <button type="button" id="accept" @click="acceptCodeSuggestions">Accept and Turn on CodeWhisperer</button>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { CodeWhispererWebview } from './backend'
import { WebviewClientFactory } from '../../webviews/client'
import saveData from '../../webviews/mixins/saveData'
const client = WebviewClientFactory.create<CodeWhispererWebview>()
export default defineComponent({
    name: 'codewhisperer',
    // This ensures that everything in `data` is persisted
    mixins: [saveData],
    // Everything relating to component state should be returned by this method
    data() {
        return {
            userInput: '',
            errorMessage: '',
            autodisabled: false,
            bindValue: 'alt+c',
            isCloud9: false,
        }
    },
    // Executed on component creation
    async created() {
        client.onDidChangeKeyBinding(val => {
            this.bindValue = val
        })
        client.onDidChangeTriggerStatus(val => {
            this.autodisabled = val
        })
        this.isCloud9 = await client.isCloud9()
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
.codewhisperer-preview-terms {
    text-align: center;
    font-weight: bold;
    text-decoration-line: underline;
}
.table-bordered {
    border-collapse: collapse;
}
table,
th,
td {
    border: 1px solid gray;
}
</style>
