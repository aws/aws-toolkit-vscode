<!-- This Vue File is the login webview of AWS Toolkit and Amazon Q.-->
<template>
    <div v-bind:class="[disabled ? 'disabled-form' : '']" class="auth-container" @click="handleDocumentClick">
        <div class="logoIcon bottomMargin">
            <!-- Icon -->

            <svg
                v-if="app === 'AMAZONQ' && stage !== 'CONNECTED'"
                width="71"
                height="71"
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
                height="80"
                viewBox="0 0 54 40"
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
            <button class="back-button bottomMargin" v-if="app === 'TOOLKIT'" @click="handleBackButtonClick">
                <svg width="13" height="11" viewBox="0 0 13 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                        d="M4.98667 0.0933332L5.73333 0.786666L1.57333 4.94667H12.0267V5.96H1.57333L5.73333 10.0667L4.98667 10.8133L0.0266666 5.8V5.10667L4.98667 0.0933332Z"
                        fill="#21A2FF"
                    />
                </svg>
            </button>
            <div class="auth-container-section">
                <div class="existing-logins" v-if="existingLogins.length > 0">
                    <div class="header bottomMargin">Connect with an existing account:</div>
                    <div v-for="(existingLogin, index) in existingLogins" :key="index">
                        <SelectableItem
                            @toggle="toggleItemSelection"
                            :isSelected="selectedLoginOption === LoginOption.EXISTING_LOGINS + index"
                            :itemId="LoginOption.EXISTING_LOGINS + index"
                            :itemText="existingLogin.text"
                            :itemTitle="existingLogin.title"
                            class="selectable-item bottomMargin"
                        ></SelectableItem>
                    </div>
                    <div class="header">Or, choose a sign-in option:</div>
                </div>
                <div class="header bottomMargin" v-if="existingLogins.length == 0">Choose a sign-in option:</div>
                <SelectableItem
                    v-if="app === 'AMAZONQ'"
                    @toggle="toggleItemSelection"
                    :isSelected="selectedLoginOption === LoginOption.BUILDER_ID"
                    :itemId="LoginOption.BUILDER_ID"
                    :itemText="'No AWS account required'"
                    :itemTitle="'Use For Free'"
                    class="selectable-item bottomMargin"
                ></SelectableItem>
                <SelectableItem
                    v-if="app === 'AMAZONQ'"
                    @toggle="toggleItemSelection"
                    :isSelected="selectedLoginOption === LoginOption.ENTERPRISE_SSO"
                    :itemId="LoginOption.ENTERPRISE_SSO"
                    :itemText="''"
                    :itemTitle="'Use with Pro license'"
                    class="selectable-item bottomMargin"
                ></SelectableItem>
                <SelectableItem
                    v-if="app === 'TOOLKIT'"
                    @toggle="toggleItemSelection"
                    :isSelected="selectedLoginOption === LoginOption.ENTERPRISE_SSO"
                    :itemId="LoginOption.ENTERPRISE_SSO"
                    :itemText="'Sign in to AWS with single sign-on'"
                    :itemTitle="'Workforce'"
                    class="selectable-item bottomMargin"
                ></SelectableItem>
                <SelectableItem
                    v-if="app === 'TOOLKIT'"
                    @toggle="toggleItemSelection"
                    :isSelected="selectedLoginOption === LoginOption.IAM_CREDENTIAL"
                    :itemId="LoginOption.IAM_CREDENTIAL"
                    :itemText="'Store keys for use with AWS CLI tools'"
                    :itemTitle="'IAM Credentials'"
                    class="selectable-item bottomMargin"
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
            <button class="back-button bottomMargin" @click="handleBackButtonClick">
                <svg width="13" height="11" viewBox="0 0 13 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                        d="M4.98667 0.0933332L5.73333 0.786666L1.57333 4.94667H12.0267V5.96H1.57333L5.73333 10.0667L4.98667 10.8133L0.0266666 5.8V5.10667L4.98667 0.0933332Z"
                        fill="#21A2FF"
                    />
                </svg>
            </button>
            <div class="auth-container-section">
                <div class="header bottomMargin">
                    Sign in with AWS IAM Identity Center:<br />
                    <a
                        class="help-link"
                        href="https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/q-in-IDE-setup.html#q-in-IDE-setup-pro-auth"
                        v-if="app === 'AMAZONQ'"
                        @click="handleHelpLinkClick"
                    >
                        <span class="help-link__icon">?</span
                        ><span class="help-link__label">Need help signing in?</span></a
                    >
                </div>
                <div class="code-catalyst-login" v-if="app === 'TOOLKIT'">
                    <div style="margin-bottom: 4px"></div>
                    <div class="subHeader">
                        Using CodeCatalyst with AWS Builder ID?
                        <a href="#" @click="handleCodeCatalystSignin()">Skip to sign-in</a>
                    </div>
                </div>
                <div class="title topMargin">Start URL</div>
                <div class="hint">Provided by your admin or help desk</div>
                <input
                    class="urlInput"
                    type="text"
                    id="startUrl"
                    name="startUrl"
                    @input="handleUrlInput"
                    v-model="startUrl"
                />
                <h4 class="start-url-error">{{ startUrlError }}</h4>
                <div class="title topMargin">Region</div>
                <div class="hint">AWS Region that hosts identity directory</div>
                <select
                    class="regionSelect"
                    id="regions"
                    name="regions"
                    v-model="selectedRegion"
                    @change="handleRegionInput($event)"
                >
                    <option v-for="region in regions" :key="region.id" :value="region.id">
                        {{ `${region.name} (${region.id})` }}
                    </option>
                </select>
                <button
                    class="continue-button topMargin"
                    :disabled="startUrl.length == 0 || startUrlError.length > 0 || !selectedRegion"
                    v-on:click="handleContinueClick()"
                >
                    Continue
                </button>
            </div>
        </template>

        <template v-if="stage === 'AUTHENTICATING'">
            <div class="auth-container-section">
                <div v-if="app === 'TOOLKIT' && profileName.length > 0" class="header bottomMargin">
                    Connecting to IAM...
                </div>
                <div v-else class="header bottomMargin">Authenticating in browser...</div>
                <button
                    class="continue-button"
                    v-on:click="handleCancelButton()"
                    style="color: #6f6f6f; background-color: var(--vscode-input-background)"
                >
                    Cancel
                </button>
            </div>
        </template>

        <template v-if="stage === 'CONNECTED'"> </template>
        <template v-if="stage === 'AWS_PROFILE'">
            <button class="back-button bottomMargin" @click="handleBackButtonClick">
                <svg width="13" height="11" viewBox="0 0 13 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                        d="M4.98667 0.0933332L5.73333 0.786666L1.57333 4.94667H12.0267V5.96H1.57333L5.73333 10.0667L4.98667 10.8133L0.0266666 5.8V5.10667L4.98667 0.0933332Z"
                        fill="#21A2FF"
                    />
                </svg>
            </button>
            <div class="header">IAM Credentials:</div>
            <div class="hint">Credentials will be added to the appropriate ~/.aws/ files</div>
            <div class="title topMargin">Profile Name</div>
            <div class="hint">The identifier for these credentials</div>
            <input
                class="iamInput bottomMargin"
                type="text"
                id="profileName"
                name="profileName"
                v-model="profileName"
            />
            <div class="title">Access Key</div>
            <input class="iamInput bottomMargin" type="text" id="accessKey" name="accessKey" v-model="accessKey" />
            <div class="title">Secret Key</div>
            <input class="iamInput bottomMargin" type="text" id="secretKey" name="secretKey" v-model="secretKey" />
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
import { LoginOption } from './types'
import { CommonAuthWebview } from './backend'
import { WebviewClientFactory } from '../../../webviews/client'
import { Region } from '../../../shared/regions/endpoints'

const client = WebviewClientFactory.create<CommonAuthWebview>()

/** Where the user is currently in the builder id setup process */
type Stage = 'START' | 'SSO_FORM' | 'CONNECTED' | 'AUTHENTICATING' | 'AWS_PROFILE'

function validateSsoUrlFormat(url: string) {
    const regex =
        /^(https?:\/\/(.+)\.awsapps\.com\/start|https?:\/\/identitycenter\.amazonaws\.com\/ssoins-[\da-zA-Z]{16})$/
    return regex.test(url)
}

function isBuilderId(url: string) {
    return url === 'https://view.awsapps.com/start'
}

function getCredentialId(loginOption: LoginOption) {
    switch (loginOption) {
        case LoginOption.BUILDER_ID:
            return 'awsId'
        case LoginOption.ENTERPRISE_SSO:
            return 'iamIdentityCenter'
        case LoginOption.IAM_CREDENTIAL:
            return 'sharedCredentials'
        default:
            return undefined
    }
}

const authUiClickOptionMap = {
    [LoginOption.BUILDER_ID]: 'auth_builderIdOption',
    [LoginOption.ENTERPRISE_SSO]: 'auth_idcOption',
    [LoginOption.IAM_CREDENTIAL]: 'auth_credentialsOption',
    [LoginOption.EXISTING_LOGINS]: 'auth_existingAuthOption',
}

function getUiClickEvent(loginOption: LoginOption) {
    return (authUiClickOptionMap as any)[loginOption]
}

interface ExistingLogin {
    id: number
    text: string
    title: string
    connectionId: string
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
            existingLogins: [] as ExistingLogin[],
            selectedLoginOption: LoginOption.NONE,
            stage: 'START' as Stage,
            regions: [] as Region[],
            startUrlError: '',
            selectedRegion: 'us-east-1',
            startUrl: '',
            app: this.app,
            LoginOption,
            profileName: '',
            accessKey: '',
            secretKey: '',
            existingConnectionStartUrls: [] as string[],
        }
    },
    async created() {
        this.startUrl = await this.getDefaultStartUrl()
        await this.emitUpdate('created')
    },

    mounted() {
        this.fetchRegions()
        void this.updateExistingConnections()

        // Reset gathered telemetry data each time we view the login page.
        // The webview panel is reset on each view of the login page by design.
        void client.resetStoredMetricMetadata()
    },
    methods: {
        toggleItemSelection(itemId: number) {
            this.selectedLoginOption = itemId
            void client.storeMetricMetadata({
                credentialSourceId: getCredentialId(itemId),
            })

            const uiClickEvent = getUiClickEvent(itemId)
            if (uiClickEvent !== undefined) {
                void client.emitUiClick(uiClickEvent)
            }
        },
        handleDocumentClick(event: any) {
            const isClickInsideSelectableItems = event.target.closest('.selectable-item')
            if (!isClickInsideSelectableItems) {
                this.selectedLoginOption = 0
            }
        },
        async handleBackButtonClick() {
            // Count hitting the back button as a user auth cancellation.
            // This will return the user to select a different login option.
            if (this.stage === 'START') {
                // For the toolkit only, the user can also back out to the explorer.
                // We will not emit another cancellation event here, just a ui_click event.
                void client.emitUiClick('auth_toolkitCloseButton')
                void client.quitLoginScreen()
            } else {
                await client.storeMetricMetadata({ isReAuth: false, result: 'Cancelled' })
                void client.emitAuthMetric()
                void client.emitUiClick('auth_backButton')
                this.stage = 'START'
            }
        },
        async handleContinueClick() {
            void client.emitUiClick('auth_continueButton')
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
                    await client.storeMetricMetadata({ region: this.selectedRegion })
                } else if (this.selectedLoginOption >= LoginOption.EXISTING_LOGINS) {
                    this.stage = 'AUTHENTICATING'
                    const selectedConnection =
                        this.existingLogins[this.selectedLoginOption - LoginOption.EXISTING_LOGINS]
                    const error = await client.useConnection(selectedConnection.connectionId, false)
                    if (error) {
                        this.stage = 'START'
                        void client.errorNotification(error)
                    } else {
                        this.stage = 'CONNECTED'
                    }
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
        async handleCodeCatalystSignin() {
            void client.emitUiClick('auth_codeCatalystSignIn')
            this.stage = 'AUTHENTICATING'
            const error = await client.startBuilderIdSetup(this.app)
            if (error) {
                this.stage = 'START'
                void client.errorNotification(error)
            } else {
                this.stage = 'CONNECTED'
            }
        },
        handleUrlInput() {
            if (this.startUrl && !validateSsoUrlFormat(this.startUrl)) {
                this.startUrlError =
                    'URLs must start with http:// or https://. Example: https://d-xxxxxxxxxx.awsapps.com/start'
            } else if (this.startUrl && this.existingConnectionStartUrls.includes(this.startUrl)) {
                this.startUrlError =
                    'A connection for this start URL already exists. Sign out before creating a new one.'
            } else {
                this.startUrlError = ''
                void client.storeMetricMetadata({
                    credentialStartUrl: this.startUrl,
                })
            }
        },
        handleRegionInput(event: any) {
            void client.storeMetricMetadata({
                region: event.target.value,
            })
            void client.emitUiClick('auth_regionSelection')
        },
        async handleCancelButton() {
            await client.storeMetricMetadata({ isReAuth: false, result: 'Cancelled' })
            void client.emitAuthMetric()
            void client.emitUiClick('auth_cancelButton')

            this.stage = 'START'
        },
        async fetchRegions() {
            const regions = await client.getRegions()
            this.regions = regions
        },
        async emitUpdate(cause?: string) {},
        async updateExistingConnections() {
            // fetch existing connections of aws toolkit in Amazon Q
            // or fetch existing connections of Amazon Q in AWS Toolkit
            // to reuse connections in AWS Toolkit & Amazon Q
            const sharedConnections = await client.fetchConnections()
            sharedConnections?.forEach((connection, index) => {
                this.existingLogins.push({
                    id: LoginOption.EXISTING_LOGINS + index,
                    text: this.app === 'TOOLKIT' ? 'Used by Amazon Q' : 'Used by AWS Toolkit',
                    title: isBuilderId(connection.startUrl)
                        ? 'AWS Builder ID'
                        : `IAM Identity Center ${connection.startUrl}`,
                    connectionId: connection.id,
                })
            })
            // fetch existing connections of itself
            const connections = await client.listConnections()
            connections.forEach(connection => {
                if ('startUrl' in connection) {
                    this.existingConnectionStartUrls.push(connection.startUrl)
                }
            })

            // If Amazon Q has no connections while Toolkit has connections
            // Auto connect Q using toolkit connection.
            if (connections.length === 0 && sharedConnections && sharedConnections.length > 0) {
                const conn = await client.findUsableConnection(sharedConnections)
                if (conn) {
                    await client.useConnection(conn.id, true)
                }
            }

            this.$forceUpdate()
        },
        async getDefaultStartUrl() {
            return await client.getDefaultStartUrl()
        },
        handleHelpLinkClick() {
            void client.emitUiClick('auth_helpLink')
        },
    },
})
</script>

<style>
.selectable-item {
    margin-bottom: 10px;
    margin-top: 10px;
    cursor: pointer;
}
.logoIcon {
    display: flex;
    flex-direction: row;
    justify-content: left;
    align-items: flex-start;
    height: auto;
}
.hint {
    color: #c6c6c6;
    margin-bottom: 5px;
    margin-top: 5px;
    font-size: 10px;
    font-weight: 500;
}
.vscode-light .hint {
    color: #3d3a3a;
}
.vscode-dark .hint {
    color: #c6c6c6;
}

.auth-container {
    display: flex;
    flex-direction: column;
    /* Stretches our overall container to the whole screen */
    height: 100%;
    width: 260px;
    /* Centers all content in to middle of page since the height is the whole screen*/
    justify-content: center;
}

.header {
    font-size: 12px;
    font-weight: bold;
}
.header.vscode-dark {
    color: white;
}
.header.vscode-light {
    color: black;
}

.title {
    margin-bottom: 3px;
    margin-top: 3px;
    font-size: 11px;
    font-weight: 500;
}
.title.vscode-dark {
    color: white;
}
.title.vscode-light {
    color: black;
}

.subHeader {
    font-size: 10px;
}
.continue-button {
    background-color: var(--vscode-button-background);
    color: white;
    width: 100%;
    height: 30px;
    border: none;
    border-radius: 4px;
    font-weight: bold;
    margin-bottom: 3px;
    margin-top: 3px;
    cursor: pointer;
}
.back-button {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--vscode-button-foreground);
    height: 13px;
    display: flex;
    align-items: center;
    padding-left: 0;
}
.back-button svg {
    margin-left: 0px;
}
.continue-button:disabled {
    background-color: var(--vscode-input-background);
    color: #6f6f6f;
    cursor: not-allowed;
}
.urlInput {
    background-color: var(--vscode-input-background);
    width: 244px;
    height: 28px;
    box-sizing: border-box;
    border: none;
    padding-left: 8px;
    padding-right: 8px;
    padding-top: 6px;
    padding-bottom: 6px;
    font-size: 13px;
    font-weight: 400;
}
body.vscode-light .urlInput {
    color: black;
}
body.vscode-dark .urlInput {
    color: #cccccc;
}
.iamInput {
    background-color: var(--vscode-input-background);
    width: 244px;
    height: 28px;
    box-sizing: border-box;
    border: none;
    padding-left: 8px;
    padding-right: 8px;
    padding-top: 6px;
    padding-bottom: 6px;
    font-size: 13px;
    font-weight: 400;
}
body.vscode-light .iamInput {
    color: black;
}
body.vscode-dark .iamInput {
    color: #cccccc;
}
.regionSelect {
    background-color: var(--vscode-input-background);
    width: 244px;
    margin-bottom: 5px;
    margin-top: 2px;
    padding-left: 8px;
    padding-right: 8px;
    padding-top: 6px;
    padding-bottom: 6px;
    font-size: 13px;
    font-weight: 400;
}
body.vscode-light .regionSelect {
    color: black;
}
body.vscode-dark .regionSelect {
    color: #cccccc;
}
.start-url-error {
    color: #ff0000;
    font-size: 8px;
}
#logo {
    fill: var(--vscode-button-foreground);
}
body.vscode-dark #logo-text {
    fill: white;
}
body.vscode-light #logo-text {
    fill: #232f3e; /* squid ink */
}
.bottomMargin {
    margin-bottom: 12px;
}
.topMargin {
    margin-top: 12px;
}

.help-link,
.help-link__icon {
    align-items: center;
    display: flex;
}

.help-link,
.help-link__label {
    font-size: 10px;
    font-weight: 400;
    margin: 4px 0 0;
    text-decoration: none;
}

.help-link__icon {
    border-radius: 50%;
    border: 1px solid var(--vscode-textLink-foreground);
    font-size: 8px;
    height: 10px;
    justify-content: center;
    width: 10px;
}

.help-link__label {
    margin: 0;
    padding: 0 0 0 2px;
}
</style>
