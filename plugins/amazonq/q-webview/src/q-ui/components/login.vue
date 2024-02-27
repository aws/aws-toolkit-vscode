<!-- Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<!-- This Vue File is the login webview of AWS Toolkit and Amazon Q.-->
<template>
    <div v-bind:class="[disabled ? 'disabled-form' : '']" class="auth-container" @click="handleDocumentClick">

        <Logo
            :app="app"
            :is-connected="stage === 'CONNECTED'"
        />
        <template v-if="stage === 'START'">
            <div class="auth-container-section">
                <div class="title" v-if="existingLogin.id === -1">Choose a sign-in option:</div>
                <SelectableItem
                    v-if="app === 'AMAZONQ'"
                    @toggle="toggleItemSelection"
                    :isSelected="selectedLoginOption === LoginOption.BUILDER_ID"
                    :itemId="LoginOption.BUILDER_ID"
                    :itemText="'Create or sign-in using AWS Builder ID'"
                    :itemTitle="'Personal'"
                    class="selectable-item"
                ></SelectableItem>
                <SelectableItem
                    @toggle="toggleItemSelection"
                    :isSelected="selectedLoginOption === LoginOption.ENTERPRISE_SSO"
                    :itemId="LoginOption.ENTERPRISE_SSO"
                    :itemText="'Single sign-on with AWS IAM Identity Center'"
                    :itemTitle="'Workforce'"
                    class="selectable-item"
                ></SelectableItem>
                <SelectableItem
                    v-if="app === 'TOOLKIT'"
                    @toggle="toggleItemSelection"
                    :isSelected="selectedLoginOption === LoginOption.IAM_CREDENTIAL"
                    :itemId="LoginOption.IAM_CREDENTIAL"
                    :itemText="'Store keys locally for use with AWS CLI tools'"
                    :itemTitle="'IAM Credential'"
                    class="selectable-item"
                ></SelectableItem>
                <button
                    class="continue-button"
                    :disabled="selectedLoginOption === 0"
                    v-on:click="handleContinueClick()"
                >
                    Continue
                </button>
            </div>
        </template>
        <template v-if="stage === 'SSO_FORM'">
            <button class="back-button" @click="handleBackButtonClick">
                <svg width="13" height="11" viewBox="0 0 13 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                        d="M4.98667 0.0933332L5.73333 0.786666L1.57333 4.94667H12.0267V5.96H1.57333L5.73333 10.0667L4.98667 10.8133L0.0266666 5.8V5.10667L4.98667 0.0933332Z"
                        fill="#21A2FF"
                    />
                </svg>
            </button>
            <div class="auth-container-section">
                <div class="title">Sign in with SSO:</div>
                <div class="p">Start URL</div>
                <div class="hint">URL for your organization, provided by an admin or help desk</div>
                <input
                    class="urlInput"
                    type="text"
                    id="startUrl"
                    name="startUrl"
                    @input="handleUrlInput"
                    v-model="startUrl"
                />
                <br /><br />
                <div class="title">Region</div>
                <div class="hint">AWS Region that hosts identity directory</div>
                <select class="regionSelect" id="regions" name="regions" v-model="selectedRegion">
                    <option v-for="region in regions" :key="region.id" :value="region.id">
                        {{ `${region.name} (${region.id})` }}
                    </option>
                </select>
                <br /><br />
                <button class="continue-button" :disabled="!urlValid" v-on:click="handleContinueClick()">
                    Continue
                </button>
            </div>
        </template>

        <template v-if="stage === 'AUTHENTICATING'">
            <div class="auth-container-section">
                <div v-if="app === 'TOOLKIT' && profileName.length > 0" class="title">Authenticating...</div>
                <div v-else class="title">Authenticating in browser...</div>
                <button class="continue-button" v-on:click="handleCancelButtom()">Cancel</button>
            </div>
        </template>

        <template v-if="stage === 'CONNECTED'"> </template>
        <template v-if="stage === 'AWS_PROFILE'">
            <button class="back-button" @click="handleBackButtonClick">
                <svg width="13" height="11" viewBox="0 0 13 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                        d="M4.98667 0.0933332L5.73333 0.786666L1.57333 4.94667H12.0267V5.96H1.57333L5.73333 10.0667L4.98667 10.8133L0.0266666 5.8V5.10667L4.98667 0.0933332Z"
                        fill="#21A2FF"
                    />
                </svg>
            </button>
            <div class="p">Profile Name</div>
            <div class="hint">The identifier for these credentials</div>
            <input class="iamInput" type="text" id="profileName" name="profileName" v-model="profileName" />

            <br /><br />
            <div class="p">Access Key</div>
            <input class="iamInput" type="text" id="accessKey" name="accessKey" v-model="accessKey" />

            <br /><br />
            <div class="p">Secret Key</div>
            <input class="iamInput" type="text" id="secretKey" name="secretKey" v-model="secretKey" />

            <br /><br />
            <button
                class="continue-button"
                :disabled="profileName.length <= 0 || accessKey.length <= 0 || secretKey.length <= 0"
                v-on:click="handleContinueClick()"
            >
                Continue
            </button>
        </template>
    </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import SelectableItem from './selectableItem.vue'
import Logo from './logo.vue'
/** Where the user is currently in the builder id setup process */
type Stage = 'START' | 'SSO_FORM' | 'CONNECTED' | 'AUTHENTICATING' | 'AWS_PROFILE'
enum LoginOption {
    NONE,
    BUILDER_ID,
    ENTERPRISE_SSO,
    IAM_CREDENTIAL,
    EXISTING_LOGINS,
}
function validateSsoUrlFormat(url: string) {
    const regex = /^https?:\/\/(.+)\.awsapps\.com\/start$/
    return regex.test(url)
}
function isBuilderId(url: string) {
    return url === 'https://view.awsapps.com/start'
}
export default defineComponent({
    name: 'Login',
    components: {
        SelectableItem,
        Logo
    },
    props: {
        disabled: {
            type: Boolean,
            default: false,
        },
        app: {
            type: String,
            default: '',
            required: true,
        },
    },
    data() {
        return {
            existingLogin: { id: -1, text: '', title: '' },
            selectedLoginOption: LoginOption.NONE,
            stage: 'START' as Stage,
            regions: [],
            urlValid: false,
            selectedRegion: '',
            startUrl: '',
            app: this.app,
            LoginOption,
            profileName: '',
            accessKey: '',
            secretKey: '',
        }
    },
    async created() {
        // await this.emitUpdate('created')
        //
        // const connection = await client.fetchConnection()
        // if (connection) {
        //     this.existingLogin = {
        //         id: LoginOption.EXISTING_LOGINS,
        //         text: 'Used by another AWS Extension',
        //         title: isBuilderId(connection.startUrl) ? 'AWS Builder ID' : 'AWS IAM Identity Center',
        //     }
        // }
    },
    mounted() {
        this.fetchRegions()
    },
    methods: {
        toggleItemSelection(itemId: number) {
            this.selectedLoginOption = itemId
        },
        handleDocumentClick(event: any) {
            const isClickInsideSelectableItems = event.target.closest('.selectable-item')
            if (!isClickInsideSelectableItems) {
                this.selectedLoginOption = 0
            }
        },
        handleBackButtonClick() {
            this.stage = 'START'
        },
        async handleContinueClick() {
            // if (this.stage === 'START') {
            //     if (this.selectedLoginOption === LoginOption.BUILDER_ID) {
            //         this.stage = 'AUTHENTICATING'
            //         const error = await client.startBuilderIdSetup(this.app)
            //         if (error) {
            //             this.stage = 'START'
            //             void client.errorNotification(error)
            //         } else {
            //             this.stage = 'CONNECTED'
            //         }
            //     } else if (this.selectedLoginOption === LoginOption.ENTERPRISE_SSO) {
            //         this.stage = 'SSO_FORM'
            //     } else if (this.selectedLoginOption === LoginOption.EXISTING_LOGINS) {
            //         // TODO:
            //         this.stage = 'START'
            //     } else if (this.selectedLoginOption === LoginOption.IAM_CREDENTIAL) {
            //         this.stage = 'AWS_PROFILE'
            //     }
            // } else if (this.stage === 'SSO_FORM') {
            //     this.stage = 'AUTHENTICATING'
            //     const error = await client.startEnterpriseSetup(this.startUrl, this.selectedRegion, this.app)
            //     if (error) {
            //         this.stage = 'START'
            //         void client.errorNotification(error)
            //     } else {
            //         this.stage = 'CONNECTED'
            //     }
            // } else if (this.stage === 'AWS_PROFILE') {
            //     this.stage = 'AUTHENTICATING'
            //     const error = await client.startIamCredentialSetup(this.profileName, this.accessKey, this.secretKey)
            //     if (error) {
            //         this.stage = 'START'
            //         void client.errorNotification(error)
            //     } else {
            //         this.stage = 'CONNECTED'
            //     }
            // }
        },
        handleUrlInput() {
            if (this.startUrl && validateSsoUrlFormat(this.startUrl)) {
                this.urlValid = true
            } else {
                this.urlValid = false
            }
        },
        handleCancelButtom() {
            this.stage = 'START'
        },
        async fetchRegions() {
            // const regions = await client.getRegions()
            // this.regions = regions
        },
        async emitUpdate(cause?: string) {},
    },
})
</script>

<style>
.selectable-item {
    margin-bottom: 10px;
    margin-top: 10px;
}
.continue-button {
    background-color: #29a7ff;
    color: white;
    width: 100%;
    height: 40px;
}
.back-button {
    background: none;
    border: none;
    cursor: pointer;
    color: white;
    font-size: 30px;
}
.hint {
    color: #948a8a;
    margin-bottom: 5px;
    margin-top: 5px;
}
.title {
    margin-bottom: 5px;
    margin-top: 5px;
    font-size: 23px;
}
.continue-button:disabled {
    background-color: #252526;
    color: #6f6f6f;
}
.urlInput {
    background-color: #252526;
    width: 100%;
    color: white;
}
.iamInput {
    background-color: #252526;
    width: 100%;
    color: white;
}
.regionSelect {
    background-color: #252526;
    width: 100%;
    color: white;
}
body.vscode-dark #logo-text {
    fill: white;
}
body.vscode-light #logo-text {
    fill: #232f3e; /* squid ink */
}
</style>
