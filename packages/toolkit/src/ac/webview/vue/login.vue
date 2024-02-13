<template>
    <div v-bind:class="[disabled ? 'disabled-form' : '']" class="auth-container" @click="handleDocumentClick">
        <div class="logoIcon">
            <!-- Icon -->

            <svg
                v-if="app === 'AMAZONQ' && stage !== 'CONNECTED'"
                id="Layer_1"
                data-name="Layer 1"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 56 56"
                width="54"
                height="54"
            >
                <path
                    d="m43.64,10.67L25.88.42c-.49-.28-1.13-.42-1.78-.42s-1.29.14-1.78.42L4.58,10.67c-.98.56-1.78,1.95-1.78,3.08v20.5c0,1.13.8,2.51,1.78,3.08l17.76,10.25c.49.28,1.13.42,1.78.42s1.29-.14,1.78-.42l17.76-10.25c.98-.56,1.78-1.95,1.78-3.08V13.75c0-1.13-.8-2.51-1.78-3.08Zm-19.53,33.31l-17.31-9.99V14.01L24.11,4.02l17.31,9.99v17.67l-13.31-7.68v-1.89c0-.26-.14-.49-.36-.62l-3.28-1.89c-.11-.06-.24-.1-.36-.1s-.25.03-.36.1l-3.28,1.89c-.22.13-.36.37-.36.62v3.79c0,.26.14.49.36.62l3.28,1.89c.11.06.24.1.36.1s.25-.03.36-.1l1.64-.95,13.31,7.68-15.31,8.84Z"
                    style="fill: #fff; stroke-width: 0px"
                />
            </svg>
            <svg
                v-if="app === 'TOOLKIT' && stage !== 'CONNECTED'"
                width="54"
                height="54"
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
                <div class="title">Choose a sign-in option:</div>
                <SelectableItem
                    v-for="item in items"
                    @toggle="toggleItemSelection"
                    :key="item.id"
                    :isSelected="selectedItem === item.id"
                    :itemId="item.id"
                    :itemText="item.text"
                    :itemTitle="item.title"
                    class="selectable-item"
                ></SelectableItem>

                <button
                    class="continue-button"
                    :disabled="selectedItem === 0"
                    v-on:click="handleContinueClickAtStartStage()"
                >
                    Continue
                </button>
            </div>
        </template>

        <template v-if="stage === 'SSO_FORM'">
            <button class="back-button" @click="handleBackButtonClick">&larr;</button>
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
                <button class="continue-button" :disabled="!urlValid" v-on:click="handleContinueClickAtSSOFormStage()">
                    Continue
                </button>
            </div>
        </template>

        <template v-if="stage === 'AUTHENTICATING'">
            <div class="auth-container-section">
                <div class="title">Authenticating in browser...</div>
                <button class="continue-button" v-on:click="handleCancelButtom()">Cancel</button>
            </div>
        </template>

        <template v-if="stage === 'CONNECTED'">
            <div class="auth-container-section">
                <div class="title">Connected</div>
            </div>
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
type Stage = 'START' | 'SSO_FORM' | 'CONNECTED' | 'AUTHENTICATING'
type App = 'TOOLKIT' | 'AMAZONQ'

function validateSsoUrlFormat(url: string) {
    const regex = /^https?:\/\/(.+)\.awsapps\.com\/start$/
    return regex.test(url)
}

function onConnectionSuccess(app: App) {
    if (app === 'TOOLKIT') {
        client.showResourceExplorer()
    } else if (app === 'AMAZONQ') {
        client.showAmazonQChat()
    }
}

export default defineComponent({
    name: 'Login',
    components: { SelectableItem },
    props: {
        disabled: {
            type: Boolean,
            default: false,
        },
    },
    data() {
        return {
            items: [
                { id: 1, text: 'Create or sign-in using AWS Builder ID', title: 'Personal' },
                { id: 2, text: 'Single sign-on with AWS IAM Identity Center', title: 'Workforce' },
            ],
            selectedItem: 0,
            stage: 'START' as Stage,
            regions: [] as Region[],
            urlValid: false,
            selectedRegion: '',
            startUrl: '',
            app: 'AMAZONQ' as App,
        }
    },
    async created() {
        await this.emitUpdate('created')
    },

    mounted() {
        this.fetchRegions()
    },

    methods: {
        toggleItemSelection(itemId: number) {
            this.selectedItem = itemId
        },
        handleDocumentClick(event: any) {
            const isClickInsideSelectableItems = event.target.closest('.selectable-item')
            if (!isClickInsideSelectableItems) {
                this.selectedItem = 0
            }
        },
        handleBackButtonClick() {
            if (this.stage === 'SSO_FORM') {
                this.stage = 'START'
            } else if (this.stage === 'AUTHENTICATING') {
                this.stage = 'START'
            }
        },
        async handleContinueClickAtStartStage() {
            if (this.selectedItem === 1) {
                this.stage = 'AUTHENTICATING'
                const error = await client.startBuilderIdSetup()
                if (error) {
                    this.stage = 'START'
                } else {
                    this.stage = 'CONNECTED'
                    onConnectionSuccess(this.app)
                }
            } else if (this.selectedItem === 2) {
                this.stage = 'SSO_FORM'
            }
        },
        async handleContinueClickAtSSOFormStage() {
            this.stage = 'AUTHENTICATING'
            console.log(this.selectedRegion)
            const error = await client.startEnterpriseSetup(this.startUrl, this.selectedRegion)
            if (error) {
                this.stage = 'START'
            } else {
                this.stage = 'CONNECTED'
                onConnectionSuccess(this.app)
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
        async signout() {},
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
