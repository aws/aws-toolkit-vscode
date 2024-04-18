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
                        <p>Install Python</p>
                    </li>
                    <li>
                        <code> pip install cfn-policy-validator </code>
                    </li>
                    <li>
                        <code> pip install tf-policy-validator </code>
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
                            >Document Type</label
                        >
                        <select id="select-document-type" v-on:change="setDocumentType" v-model="documentType">
                            <option value="CloudFormation">CloudFormation</option>
                            <option value="Terraform Plan">Terraform Plan</option>
                            <option value="JSON Policy Language">JSON Policy Language</option>
                        </select>
                    </div>
                    <div style="display: block" v-if="documentType == 'JSON Policy Language'">
                        <label for="select-policy-type" style="display: block; margin-top: 5px; margin-bottom: 3px"
                            >Policy Type</label
                        >
                        <select id="select-policy-type" v-on:change="setPolicyType" v-model="policyType">
                            <option value="Identity">Identity</option>
                            <option value="Resource">Resource</option>
                        </select>
                    </div>
                </div>
                <div v-if="documentType == 'CloudFormation'">
                    <label for="input-path" style="display: block; margin-top: 15px; margin-bottom: 3px"
                        >CloudFormation Parameter File (Optional)</label
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
                        placeholder="CloudFormation Parameter File Path"
                        v-on:change="setCfnParameterFilePath"
                        v-model="initialData.cfnParameterPath"
                    />
                </div>
                <label for="input-path" style="display: block; cursor: not-allowed; margin-top: 15px; opacity: 0.4">
                    Currently Read Input File
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
                        <button class="button-theme-primary" v-on:click="runValidator">Run Policy Validation</button>
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
                    Validate your policy against your specified security standards using AWS Identity and Access
                    Management Access Analyzer custom policy checks. You can check against a reference policy or a list
                    of IAM actions.
                </p>
                <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-custom-policy-checks.html"
                    >More about Custom Policy Checks</a
                >
                <div style="justify-content: space-between">
                    <div style="display: flex">
                        <div style="display: block; margin-right: 25px">
                            <label for="select-check-type" style="display: block; margin-top: 15px; margin-bottom: 3px"
                                >Check Type</label
                            >
                            <select id="select-check-type" style="margin-bottom: 5px" v-on:change="setCheckType">
                                <option value="CheckNoNewAccess">CheckNoNewAccess</option>
                                <option value="CheckAccessNotGranted">CheckAccessNotGranted</option>
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
                                >Reference Policy Type</label
                            >
                            <select
                                id="select-reference-type"
                                v-on:change="setResourcePolicyType"
                                v-model="resourcePolicyType"
                            >
                                <option value="Identity">Identity</option>
                                <option value="Resource">Resource</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div>
                    <label for="input-path" style="display: block; margin-bottom: 3px">Reference File</label>
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
                        :placeholder="customChecksPathPlaceholder"
                        v-on:change="setReferenceFilePath"
                        v-model="initialData.referenceFilePath"
                    />
                </div>
                <div style="margin-top: 5px" v-if="initialData.referenceFileErrorMessage">
                    <p style="color: red">
                        {{ initialData.referenceFileErrorMessage }}
                    </p>
                </div>
                <div>
                    <textarea
                        style="
                            width: 100%;
                            margin-bottom: 10px;
                            font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial,
                                sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol;
                        "
                        rows="30"
                        v-model="initialData.referenceDocument"
                        :placeholder="customChecksTextAreaPlaceholder"
                    ></textarea>
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
import '@../../../resources/css/base.css'
import '@../../../resources/css/securityIssue.css'

const client = WebviewClientFactory.create<IamPolicyChecksWebview>()

export default defineComponent({
    mixins: [saveData],
    data: () => ({
        documentType: 'CloudFormation',
        policyType: 'Identity',
        resourcePolicyType: 'Identity',
        checkType: 'CheckNoNewAccess',
        initialData: {
            referenceFilePath: '',
            referenceDocument: '',
            referenceFileErrorMessage: '',
            cfnParameterPath: '',
            pythonToolsInstalled: false,
        },
        inputPath: '',
        customChecksPathPlaceholder: 'Reference policy file path',
        customChecksTextAreaPlaceholder: 'Enter reference policy document',
        validatePolicyResponse: '',
        validatePolicyResponseColor: 'red',
        customPolicyCheckResponse: '',
        customPolicyCheckResponseColor: 'red',
    }),
    async created() {
        this.initialData = (await client.init()) ?? this.initialData
        client.onChangeInputPath((data: string) => {
            this.inputPath = data
        })
        client.onChangeReferenceFilePath((data: string) => {
            this.initialData.referenceFilePath = data
            client
                .getReferenceDocument(this.initialData.referenceFilePath)
                .then(response => {
                    this.initialData.referenceDocument = response
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
            this.initialData.referenceFileErrorMessage = data
        })
    },
    methods: {
        setDocumentType: function (event: any) {
            this.documentType = event.target.value
        },
        setPolicyType: function (event: any) {
            this.policyType = event.target.value
        },
        setResourcePolicyType: function (event: any) {
            this.resourcePolicyType = event.target.value
        },
        setCheckType: function (event: any) {
            this.checkType = event.target.value
            if (this.checkType == 'CheckNoNewAccess') {
                this.customChecksPathPlaceholder = 'Reference policy file path'
                this.customChecksTextAreaPlaceholder = 'Enter reference policy document'
            } else {
                this.customChecksPathPlaceholder = 'List of actions file path'
                this.customChecksTextAreaPlaceholder = 'Enter list of actions'
            }
        },
        setReferenceFilePath: function (event: any) {
            this.initialData.referenceFilePath = event.target.value
            client
                .getReferenceDocument(this.initialData.referenceFilePath)
                .then(response => {
                    this.initialData.referenceDocument = response
                })
                .catch(err => console.log(err))
        },
        setCfnParameterFilePath: function (event: any) {
            this.initialData.cfnParameterPath = event.target.value
        },
        runValidator: function () {
            client.validatePolicy(this.documentType, this.policyType, this.initialData.cfnParameterPath)
        },
        runCustomPolicyCheck: function () {
            if (this.checkType == 'CheckNoNewAccess') {
                client.checkNoNewAccess(
                    this.documentType,
                    this.resourcePolicyType,
                    this.initialData.referenceDocument,
                    this.initialData.cfnParameterPath
                )
            } else {
                client.checkAccessNotGranted(
                    this.documentType,
                    this.initialData.referenceDocument,
                    this.initialData.cfnParameterPath
                )
            }
        },
    },
    computed: {},
})
</script>
