/*! * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */

<template>
    <div id="app">
        <div>
            <h1>IAM Policy Checks</h1>
            <div v-if="!initialData.pythonToolsInstalled">
                <h3>Getting Started</h3>
                <p>
                    Policy Checks requires Python 3.6+ and the respective Python CLI tools installed, based on the
                    document type:
                </p>
                <ol>
                    <li>
                        <p>Install Python 3.6+</p>
                    </li>
                    <li>
                        <code> pip install cfn-policy-validator==0.0.32 </code>
                    </li>
                    <li>
                        <code> pip install tf-policy-validator==0.0.7 </code>
                    </li>
                    <li>
                        <p>Provide IAM Roles Credentials</p>
                    </li>
                </ol>
            </div>
            <div style="justify-content: space-between">
                <div style="display: flex">
                    <div style="display: block; margin-right: 25px">
                        <label for="select-document-type" style="display: block; margin-top: 5px; margin-bottom: 3px"
                            >Select a Document Type</label
                        >
                        <select id="select-document-type" v-on:change="setDocumentType" v-model="documentType">
                            <option value="CloudFormation">CloudFormation Template</option>
                            <option value="Terraform Plan">Terraform Plan</option>
                            <option value="JSON Policy Language">JSON Policy Language</option>
                        </select>
                    </div>
                    <div style="display: block" v-if="documentType == 'JSON Policy Language'">
                        <label for="select-policy-type" style="display: block; margin-top: 5px; margin-bottom: 3px"
                            >Policy Type</label
                        >
                        <select
                            id="select-policy-type"
                            v-on:change="setValidatePolicyType"
                            v-model="validatePolicyType"
                        >
                            <option value="Identity">Identity</option>
                            <option value="Resource">Resource</option>
                        </select>
                    </div>
                </div>
                <label for="input-path" style="display: block; cursor: not-allowed; margin-top: 15px; opacity: 0.4">
                    Open a file with the selected Document Type in the VS Code text editor to begin
                </label>
                <input
                    type="text"
                    style="
                        display: flex;
                        cursor: not-allowed;
                        box-sizing: border-box;
                        position: relative;
                        opacity: 0.4;
                        width: 70%;
                    "
                    id="input-path"
                    placeholder="Input policy file path"
                    readOnly
                    disabled
                    v-model="inputPath"
                />
            </div>
            <div v-if="documentType == 'CloudFormation'">
                <label for="input-path" style="display: block; margin-top: 15px; margin-bottom: 3px"
                    >CloudFormation Parameter File (Optional)</label
                >
                <input
                    type="text"
                    style="display: flex; box-sizing: border-box; position: relative; margin-bottom: 10px; width: 70%"
                    id="input-path"
                    placeholder="CloudFormation Parameter File Path"
                    v-on:change="setCfnParameterFilePath"
                    v-model="initialData.cfnParameterPath"
                />
            </div>
            <div v-if="documentType == 'Terraform Plan'" style="margin-top: 15px">
                <p>
                    For Terraform Plans, generate terraform plan file and convert the plan files to machine-readable
                    JSON files before running policy checks.
                </p>
                <ol>
                    <li><code>$terraform init</code></li>
                    <li><code>$terraform plan -out tf.plan</code></li>
                    <li><code>$terraform show -json -no-color tf.plan > tf.json</code></li>
                    - For TF 0.12 and prior, use command
                    <code>$terraform show tf.plan > tf.out</code>
                    <li>View the converted JSON file in VS Code and run the desired policy check</li>
                </ol>
            </div>
        </div>
        <hr style="margin-top: 25px" />
        <div class="validate-container">
            <h2 style="border-bottom-style: none">Validate Policies</h2>
            <div style="display: grid">
                <p>
                    Validate your policy against IAM policy grammar and AWS best practices. You can view policy
                    validation check findings that include security warnings, errors, general warnings, and suggestions
                    for your policy. These findings provide actionable recommendations that help you author policies
                    that are functional and conform to security best practices.
                </p>
                <div style="display: grid">
                    <div>
                        <button
                            class="button-theme-primary"
                            v-on:click="runValidator"
                            :disabled="validateButtonDisabled"
                        >
                            Run Policy Validation
                        </button>
                        <div style="margin-top: 5px">
                            <p :style="{ color: validatePolicyResponseColor }">
                                {{ validatePolicyResponse }}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <hr style="margin-top: 25px" />
        <div class="custom-checks-container" v-if="documentType != 'JSON Policy Language'">
            <h2 style="border-bottom-style: none">Custom Policy Checks</h2>
            <div style="display: block">
                <p>
                    Validate your policy against your specified security standards using IAM Access Analyzer custom
                    policy checks. You can check against a reference policy or a list of IAM actions.
                </p>
                <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-custom-policy-checks.html"
                    >More about Custom Policy Checks</a
                >
                <div style="justify-content: space-between">
                    <div style="display: flex">
                        <div style="display: block; margin-right: 25px">
                            <label for="select-check-type" style="display: block; margin-top: 15px; margin-bottom: 3px"
                                >Select a Check Type</label
                            >
                            <select id="select-check-type" style="margin-bottom: 5px" v-on:change="setCheckType">
                                <option value="CheckAccessNotGranted">CheckAccessNotGranted</option>
                                <option value="CheckNoNewAccess">CheckNoNewAccess</option>
                            </select>
                        </div>
                        <div
                            style="display: block"
                            v-if="
                                (documentType == 'CloudFormation' || documentType == 'Terraform Plan') &&
                                checkType == 'CheckNoNewAccess'
                            "
                        >
                            <label
                                for="select-reference-type"
                                style="display: block; margin-top: 15px; margin-bottom: 3px"
                                >Select a Reference Policy Type</label
                            >
                            <select
                                id="select-reference-type"
                                v-on:change="setCheckNoNewAccessPolicyType"
                                v-model="checkNoNewAccessPolicyType"
                            >
                                <option value="Identity">Identity</option>
                                <option value="Resource">Resource</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div v-if="checkType == 'CheckNoNewAccess'">
                    <div>
                        <label for="input-path" style="display: block; margin-bottom: 3px"
                            >Provide a reference file containing a JSON Policy Document</label
                        >
                        <input
                            type="text"
                            style="
                                display: flex;
                                box-sizing: border-box;
                                position: relative;
                                margin-bottom: 10px;
                                width: 70%;
                            "
                            id="input-path"
                            placeholder="Enter reference policy document"
                            v-on:change="setCheckNoNewAccessFilePath"
                            v-model="initialData.checkNoNewAccessFilePath"
                        />
                    </div>
                    <div style="margin-top: 5px" v-if="initialData.customChecksFileErrorMessage">
                        <p style="color: var(--vscode-errorForeground)">
                            {{ initialData.customChecksFileErrorMessage }}
                        </p>
                    </div>
                    <div>
                        <label style="margin-bottom: 3px">Enter a JSON Policy Document</label>
                        <textarea
                            style="
                                width: 100%;
                                margin-bottom: 10px;
                                font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial,
                                    sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol;
                            "
                            rows="30"
                            v-model="initialData.checkNoNewAccessTextArea"
                            v-on:change="setCheckNoNewAccessTextArea"
                            placeholder="Reference policy document"
                        ></textarea>
                    </div>
                </div>
                <div v-if="checkType == 'CheckAccessNotGranted'">
                    <div>
                        <label for="input-path" style="display: block; margin-bottom: 3px"
                            >Provide a reference file containing a list of actions</label
                        >
                        <input
                            type="text"
                            style="
                                display: flex;
                                box-sizing: border-box;
                                position: relative;
                                margin-bottom: 10px;
                                width: 70%;
                            "
                            id="input-path"
                            placeholder="List of actions file path"
                            v-on:change="setCheckAccessNotGrantedFilePath"
                            v-model="initialData.checkAccessNotGrantedFilePath"
                        />
                    </div>
                    <div style="margin-top: 5px" v-if="initialData.customChecksFileErrorMessage">
                        <p style="color: var(--vscode-errorForeground)">
                            {{ initialData.customChecksFileErrorMessage }}
                        </p>
                    </div>
                    <div>
                        <label style="margin-bottom: 3px">Enter a comma-separated list of actions</label>
                        <textarea
                            style="
                                width: 100%;
                                margin-bottom: 10px;
                                font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial,
                                    sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol;
                            "
                            rows="30"
                            v-on:change="setCheckAccessNotGrantedTextArea"
                            v-model="initialData.checkAccessNotGrantedTextArea"
                            placeholder="List of actions"
                        ></textarea>
                    </div>
                </div>
                <div style="display: grid">
                    <b style="margin-bottom: 5px"
                        >A charge is associated with each custom policy check. For more details about pricing, see
                        <a href="https://aws.amazon.com/iam/access-analyzer/pricing/"> IAM Access Analyzer pricing </a>.
                    </b>
                    <div>
                        <button
                            class="button-theme-primary"
                            style="margin-bottom: 5px"
                            v-on:click="runCustomPolicyCheck"
                            :disabled="customCheckButtonDisabled"
                        >
                            Run Custom Policy Check
                        </button>
                        <div style="margin-top: 5px">
                            <p :style="{ color: customPolicyCheckResponseColor }">
                                {{ customPolicyCheckResponse }}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../webviews/client'
import saveData from '../../webviews/mixins/saveData'
import { IamPolicyChecksWebview } from './iamPolicyChecks'
import { PolicyChecksDocumentType, PolicyChecksPolicyType } from './constants'
import '@../../../resources/css/base.css'
import '@../../../resources/css/securityIssue.css'

const client = WebviewClientFactory.create<IamPolicyChecksWebview>()

export default defineComponent({
    mixins: [saveData],
    data: () => ({
        documentType: 'CloudFormation',
        validatePolicyType: 'Identity',
        checkNoNewAccessPolicyType: 'Identity',
        checkType: 'CheckAccessNotGranted',
        initialData: {
            checkNoNewAccessFilePath: '',
            checkNoNewAccessTextArea: '',
            checkAccessNotGrantedFilePath: '',
            checkAccessNotGrantedTextArea: '',
            customChecksFileErrorMessage: '',
            cfnParameterPath: '',
            pythonToolsInstalled: false,
        },
        inputPath: '',
        checkAccessNotGrantedPathPlaceholder: 'List of actions file path',
        checkAccessNotGrantedTextAreaPlaceholder: 'Enter a list of actions',
        validatePolicyResponse: '',
        validatePolicyResponseColor: 'var(--vscode-errorForeground)',
        customPolicyCheckResponse: '',
        customPolicyCheckResponseColor: 'var(--vscode-errorForeground)',
        validateButtonDisabled: false,
        customCheckButtonDisabled: false,
    }),
    async created() {
        this.initialData = (await client.init()) ?? this.initialData
        client.onChangeInputPath((data: string) => {
            this.inputPath = data
        })
        client.onChangeCheckNoNewAccessFilePath((data: string) => {
            this.initialData.checkNoNewAccessFilePath = data
            client
                .readCustomChecksFile(this.initialData.checkNoNewAccessFilePath)
                .then(response => {
                    this.initialData.checkNoNewAccessTextArea = response
                })
                .catch(err => console.log(err))
        })
        client.onChangeCheckAccessNotGrantedFilePath((data: string) => {
            this.initialData.checkAccessNotGrantedFilePath = data
            client
                .readCustomChecksFile(this.initialData.checkAccessNotGrantedFilePath)
                .then(response => {
                    this.initialData.checkAccessNotGrantedTextArea = response
                })
                .catch(err => console.log(err))
        })
        client.onChangeCloudformationParameterFilePath((data: string) => {
            this.initialData.cfnParameterPath = data
        })
        client.onValidatePolicyResponse((data: [string, string]) => {
            this.validatePolicyResponse = data[0]
            this.validatePolicyResponseColor = data[1]
        })
        client.onCustomPolicyCheckResponse((data: [string, string]) => {
            this.customPolicyCheckResponse = data[0]
            this.customPolicyCheckResponseColor = data[1]
        })
        client.onFileReadError((data: string) => {
            this.initialData.customChecksFileErrorMessage = data
        })
    },
    methods: {
        setDocumentType: function (event: any) {
            client.emitUiClick('accessanalyzer_selectDocumentType')
            this.documentType = event.target.value
        },
        setValidatePolicyType: function (event: any) {
            client.emitUiClick('accessanalyzer_selectInputPolicyType')
            this.validatePolicyType = event.target.value
        },
        setCheckNoNewAccessPolicyType: function (event: any) {
            client.emitUiClick('accessanalyzer_selectReferencePolicyType')
            this.checkNoNewAccessPolicyType = event.target.value
        },
        setCheckType: function (event: any) {
            client.emitUiClick('accessanalyzer_selectCustomCheckType')
            this.checkType = event.target.value
        },
        setCheckNoNewAccessFilePath: function (event: any) {
            client.emitUiClick('accessanalyzer_selectCheckNoNewAccessFilePath')
            this.initialData.checkNoNewAccessFilePath = event.target.value
            client
                .readCustomChecksFile(this.initialData.checkNoNewAccessFilePath)
                .then(response => {
                    this.initialData.checkNoNewAccessTextArea = response
                })
                .catch(err => console.log(err))
        },
        setCheckNoNewAccessTextArea: function (event: any) {
            this.initialData.checkNoNewAccessTextArea = event.target.value
            this.initialData.checkNoNewAccessFilePath = ''
        },
        setCheckAccessNotGrantedFilePath: function (event: any) {
            client.emitUiClick('accessanalyzer_selectCheckAccessNotGrantedFilePath')
            this.initialData.checkAccessNotGrantedFilePath = event.target.value
            client
                .readCustomChecksFile(this.initialData.checkAccessNotGrantedFilePath)
                .then(response => {
                    this.initialData.checkAccessNotGrantedTextArea = response
                })
                .catch(err => console.log(err))
        },
        setCheckAccessNotGrantedTextArea: function (event: any) {
            this.initialData.checkAccessNotGrantedTextArea = event.target.value
            this.initialData.checkAccessNotGrantedFilePath = ''
        },
        setCfnParameterFilePath: function (event: any) {
            client.emitUiClick('accessanalyzer_selectCfnParameterFilePath')
            this.initialData.cfnParameterPath = event.target.value
        },
        runValidator: async function () {
            this.validateButtonDisabled = true
            client.emitUiClick('accessanalyzer_runValidatePolicy')
            await client.validatePolicy(
                this.documentType as PolicyChecksDocumentType,
                this.validatePolicyType as PolicyChecksPolicyType,
                this.initialData.cfnParameterPath
            )
            this.validateButtonDisabled = false
        },
        runCustomPolicyCheck: async function () {
            this.customCheckButtonDisabled = true
            client.emitUiClick('accessanalyzer_runCustomPolicyCheck')
            if (this.checkType == 'CheckNoNewAccess') {
                await client.checkNoNewAccess(
                    this.documentType as PolicyChecksDocumentType,
                    this.checkNoNewAccessPolicyType as PolicyChecksPolicyType,
                    this.initialData.checkNoNewAccessTextArea,
                    this.initialData.cfnParameterPath
                )
            } else if (this.checkType == 'CheckAccessNotGranted') {
                await client.checkAccessNotGranted(
                    this.documentType as PolicyChecksDocumentType,
                    this.initialData.checkAccessNotGrantedTextArea,
                    this.initialData.cfnParameterPath
                )
            }
            this.customCheckButtonDisabled = false
        },
    },
    computed: {},
})
</script>
