<!-- This Vue File is the login webview of AWS Toolkit and Amazon Q.-->
<template>
    <div v-bind:class="[disabled ? 'disabled-form' : '']" class="auth-container" @click="handleDocumentClick">
        <div class="logoIcon">
            <!-- Icon -->

            <svg
                v-if="app === 'AMAZONQ' && stage !== 'CONNECTED'"
                width="100"
                height="100"
                viewBox="0 0 71 71"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <g clip-path="url(#clip0_331_37336)">
                    <path
                        d="M30.1307 1.46438L8.83068 13.7563C5.45818 15.7087 3.37256 19.3031 3.37256 23.2081V47.8067C3.37256 51.6969 5.45818 55.306 8.83068 57.2585L30.1307 69.5504C33.5032 71.5029 37.6596 71.5029 41.0321 69.5504L62.3321 57.2585C65.7046 55.306 67.7903 51.7117 67.7903 47.8067V23.2081C67.7903 19.3179 65.7046 15.7087 62.3321 13.7563L41.0321 1.46438C37.6596 -0.488125 33.5032 -0.488125 30.1307 1.46438Z"
                        fill="url(#paint0_linear_331_37336)"
                    />
                    <path
                        d="M54.1966 21.6843L38.2364 12.469C37.5116 12.0401 36.5354 11.833 35.5739 11.833C34.6124 11.833 33.651 12.0401 32.9114 12.469L16.9512 21.6843C15.4868 22.5274 14.2887 24.5982 14.2887 26.2845V44.7149C14.2887 46.4011 15.4868 48.472 16.9512 49.3151L32.9114 58.5303C33.6362 58.9593 34.6124 59.1663 35.5739 59.1663C36.5354 59.1663 37.4968 58.9593 38.2364 58.5303L54.1966 49.3151C55.661 48.472 56.8591 46.4011 56.8591 44.7149V26.2845C56.8591 24.5982 55.661 22.5274 54.1966 21.6843ZM36.0029 54.7141C36.0029 54.7141 35.7958 54.7584 35.5887 54.7584C35.3816 54.7584 35.2337 54.7288 35.1745 54.7141L19.1699 45.4693C19.0072 45.3213 18.8002 44.9515 18.7558 44.7445V26.2549C18.8002 26.0478 19.022 25.678 19.1699 25.5301L35.1745 16.2853C35.1745 16.2853 35.3816 16.2409 35.5887 16.2409C35.7958 16.2409 35.9437 16.2705 36.0029 16.2853L52.0075 25.5301C52.1702 25.678 52.3772 26.0478 52.4216 26.2549V42.6588L40.0262 35.4997V33.5472C40.0262 33.1626 39.8191 32.8224 39.4937 32.6301L36.1212 30.6776C35.9585 30.5888 35.7662 30.5297 35.5887 30.5297C35.4112 30.5297 35.2189 30.574 35.0562 30.6776L31.6837 32.6301C31.3583 32.8224 31.1512 33.1774 31.1512 33.5472V37.4374C31.1512 37.822 31.3583 38.1622 31.6837 38.3545L35.0562 40.307C35.2189 40.3957 35.4112 40.4549 35.5887 40.4549C35.7662 40.4549 35.9585 40.4105 36.1212 40.307L37.8074 39.3307L50.2029 46.4899L36.0029 54.6845V54.7141Z"
                        fill="white"
                    />
                </g>
                <defs>
                    <linearGradient
                        id="paint0_linear_331_37336"
                        x1="64.1515"
                        y1="-5.31021"
                        x2="10.5465"
                        y2="71.2515"
                        gradientUnits="userSpaceOnUse"
                    >
                        <stop stop-color="#A7F8FF" />
                        <stop offset="0.03" stop-color="#9DF1FF" />
                        <stop offset="0.08" stop-color="#84E1FF" />
                        <stop offset="0.15" stop-color="#5AC7FF" />
                        <stop offset="0.22" stop-color="#21A2FF" />
                        <stop offset="0.26" stop-color="#008DFF" />
                        <stop offset="0.66" stop-color="#7F33FF" />
                        <stop offset="0.99" stop-color="#39127D" />
                    </linearGradient>
                    <clipPath id="clip0_331_37336">
                        <rect width="71" height="71" fill="white" />
                    </clipPath>
                </defs>
            </svg>
            <svg
                v-if="app === 'TOOLKIT' && stage !== 'CONNECTED'"
                width="100"
                height="100"
                viewBox="0 0 54 54"
                fill="none"
                id="Layer_1"
                data-name="Layer 1"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    id="logo-text"
                    d="M14.09,10.85a4.7,4.7,0,0,0,.19,1.48,7.73,7.73,0,0,0,.54,1.19.77.77,0,0,1,.12.38.64.64,0,0,1-.32.49l-1,.7a.83.83,0,0,1-.44.15.69.69,0,0,1-.49-.23,3.8,3.8,0,0,1-.6-.77q-.25-.42-.51-1a6.14,6.14,0,0,1-4.89,2.3,4.54,4.54,0,0,1-3.32-1.19,4.27,4.27,0,0,1-1.22-3.2A4.28,4.28,0,0,1,3.61,7.75,6.06,6.06,0,0,1,7.69,6.46a12.47,12.47,0,0,1,1.76.13q.92.13,1.91.36V5.73a3.65,3.65,0,0,0-.79-2.66A3.81,3.81,0,0,0,7.86,2.3a7.71,7.71,0,0,0-1.79.22,12.78,12.78,0,0,0-1.79.57,4.55,4.55,0,0,1-.58.22l-.26,0q-.35,0-.35-.52V2a1.09,1.09,0,0,1,.12-.58,1.2,1.2,0,0,1,.47-.35A10.88,10.88,0,0,1,5.77.32,10.19,10.19,0,0,1,8.36,0a6,6,0,0,1,4.35,1.35,5.49,5.49,0,0,1,1.38,4.09ZM7.34,13.38a5.36,5.36,0,0,0,1.72-.31A3.63,3.63,0,0,0,10.63,12,2.62,2.62,0,0,0,11.19,11a5.63,5.63,0,0,0,.16-1.44v-.7a14.35,14.35,0,0,0-1.53-.28,12.37,12.37,0,0,0-1.56-.1,3.84,3.84,0,0,0-2.47.67A2.34,2.34,0,0,0,5,11a2.35,2.35,0,0,0,.61,1.76A2.4,2.4,0,0,0,7.34,13.38Zm13.35,1.8a1,1,0,0,1-.64-.16,1.3,1.3,0,0,1-.35-.65L15.81,1.51a3,3,0,0,1-.15-.67.36.36,0,0,1,.41-.41H17.7a1,1,0,0,1,.65.16,1.4,1.4,0,0,1,.33.65l2.79,11,2.59-11A1.17,1.17,0,0,1,24.39.6a1.1,1.1,0,0,1,.67-.16H26.4a1.1,1.1,0,0,1,.67.16,1.17,1.17,0,0,1,.32.65L30,12.39,32.88,1.25A1.39,1.39,0,0,1,33.22.6a1,1,0,0,1,.65-.16h1.54a.36.36,0,0,1,.41.41,1.36,1.36,0,0,1,0,.26,3.64,3.64,0,0,1-.12.41l-4,12.86a1.3,1.3,0,0,1-.35.65,1,1,0,0,1-.64.16H29.25a1,1,0,0,1-.67-.17,1.26,1.26,0,0,1-.32-.67L25.67,3.64,23.11,14.34a1.26,1.26,0,0,1-.32.67,1,1,0,0,1-.67.17Zm21.36.44a11.28,11.28,0,0,1-2.56-.29,7.44,7.44,0,0,1-1.92-.67,1,1,0,0,1-.61-.93v-.84q0-.52.38-.52a.9.9,0,0,1,.31.06l.42.17a8.77,8.77,0,0,0,1.83.58,9.78,9.78,0,0,0,2,.2,4.48,4.48,0,0,0,2.43-.55,1.76,1.76,0,0,0,.86-1.57,1.61,1.61,0,0,0-.45-1.16A4.29,4.29,0,0,0,43,9.22l-2.41-.76A5.15,5.15,0,0,1,38,6.78a3.94,3.94,0,0,1-.83-2.41,3.7,3.7,0,0,1,.45-1.85,4.47,4.47,0,0,1,1.19-1.37A5.27,5.27,0,0,1,40.51.29,7.4,7.4,0,0,1,42.6,0a8.87,8.87,0,0,1,1.12.07q.57.07,1.08.19t.95.26a4.27,4.27,0,0,1,.7.29,1.59,1.59,0,0,1,.49.41.94.94,0,0,1,.15.55v.79q0,.52-.38.52a1.76,1.76,0,0,1-.64-.2,7.74,7.74,0,0,0-3.2-.64,4.37,4.37,0,0,0-2.21.47,1.6,1.6,0,0,0-.79,1.48,1.58,1.58,0,0,0,.49,1.18,4.94,4.94,0,0,0,1.83.92L44.55,7a5.08,5.08,0,0,1,2.57,1.6A3.76,3.76,0,0,1,47.9,11a4.21,4.21,0,0,1-.44,1.93,4.4,4.4,0,0,1-1.21,1.47,5.43,5.43,0,0,1-1.85.93A8.25,8.25,0,0,1,42.05,15.62Z"
                />
                <path
                    fill="#FF9900"
                    class="cls-1"
                    d="M45.19,23.81C39.72,27.85,31.78,30,25,30A36.64,36.64,0,0,1,.22,20.57c-.51-.46-.06-1.09.56-.74A49.78,49.78,0,0,0,25.53,26.4,49.23,49.23,0,0,0,44.4,22.53C45.32,22.14,46.1,23.14,45.19,23.81Z"
                />
                <path
                    fill="#FF9900"
                    class="cls-1"
                    d="M47.47,21.21c-.7-.9-4.63-.42-6.39-.21-.53.06-.62-.4-.14-.74,3.13-2.2,8.27-1.57,8.86-.83s-.16,5.89-3.09,8.35c-.45.38-.88.18-.68-.32C46.69,25.8,48.17,22.11,47.47,21.21Z"
                />
            </svg>
        </div>
        <template v-if="stage === 'START'">
            <div class="auth-container-section">
                <div class="existing-logins" v-if="existingLogin.id !== -1 && app === 'AMAZONQ'">
                    <div class="title">Connect with an existing account:</div>
                    <SelectableItem
                        @toggle="toggleItemSelection"
                        :isSelected="selectedLoginOption === LoginOption.EXISTING_LOGINS"
                        :itemId="LoginOption.EXISTING_LOGINS"
                        :itemText="existingLogin.text"
                        :itemTitle="existingLogin.title"
                        class="selectable-item"
                    ></SelectableItem>
                    <div class="title">Or, choose a sign-in option:</div>
                </div>
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
                <div v-if="app === 'TOOLKIT' && profileName.length > 0" class="title">Connecting to IAM...</div>
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
import { CommonAuthWebview } from './backend'
import { WebviewClientFactory } from '../../../webviews/client'
import { Region } from '../../../shared/regions/endpoints'

const client = WebviewClientFactory.create<CommonAuthWebview>()

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
    components: { SelectableItem },
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
            regions: [] as Region[],
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
        await this.emitUpdate('created')

        const connection = await client.fetchConnection()
        if (connection) {
            this.existingLogin = {
                id: LoginOption.EXISTING_LOGINS,
                text: 'Used by another AWS Extension',
                title: isBuilderId(connection.startUrl) ? 'AWS Builder ID' : 'AWS IAM Identity Center',
            }
        }
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
            if (this.stage === 'START') {
                if (this.selectedLoginOption === LoginOption.BUILDER_ID) {
                    this.stage = 'AUTHENTICATING'
                    const error = await client.startBuilderIdSetup(this.app)
                    if (error) {
                        this.stage = 'START'
                        void client.errorNotification(error)
                    } else {
                        this.stage = 'CONNECTED'
                    }
                } else if (this.selectedLoginOption === LoginOption.ENTERPRISE_SSO) {
                    this.stage = 'SSO_FORM'
                } else if (this.selectedLoginOption === LoginOption.EXISTING_LOGINS) {
                    // TODO:
                    this.stage = 'START'
                } else if (this.selectedLoginOption === LoginOption.IAM_CREDENTIAL) {
                    this.stage = 'AWS_PROFILE'
                }
            } else if (this.stage === 'SSO_FORM') {
                this.stage = 'AUTHENTICATING'
                const error = await client.startEnterpriseSetup(this.startUrl, this.selectedRegion, this.app)
                if (error) {
                    this.stage = 'START'
                    void client.errorNotification(error)
                } else {
                    this.stage = 'CONNECTED'
                }
            } else if (this.stage === 'AWS_PROFILE') {
                this.stage = 'AUTHENTICATING'
                const error = await client.startIamCredentialSetup(this.profileName, this.accessKey, this.secretKey)
                if (error) {
                    this.stage = 'START'
                    void client.errorNotification(error)
                } else {
                    this.stage = 'CONNECTED'
                }
            }
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
            const regions = await client.getRegions()
            this.regions = regions
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
.logoIcon {
    display: flex;
    flex-direction: row;
    justify-content: left;
    align-items: flex-start;
    padding-top: 150px;
    padding-bottom: 10px;
    padding-left: 10px;
    height: auto;
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
    font-size: 15px;
    font-weight: bold;
    color: white;
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
#logo {
    fill: var(--vscode-button-foreground);
    padding-top: 0.2em;
}
body.vscode-dark #logo-text {
    fill: white;
}
body.vscode-light #logo-text {
    fill: #232f3e; /* squid ink */
}
</style>
