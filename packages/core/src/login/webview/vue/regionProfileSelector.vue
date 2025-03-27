<template>
    <div v-show="doShow" id="profile-selector-container" :data-app="app">
        <!-- Icon -->
        <div id="icon-container">
            <svg
                v-if="app === 'AMAZONQ'"
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
        </div>

        <div class="text-container">
            <div id="title">Choose a Q Developer profile</div>
            <div class="description">
                Your administrator has given you access to Q from multiple profiles. Choose the profile that meets your
                current working needs. You can change your profile at any time.
            </div>
        </div>

        <div id="content-container">
            <div class="options">
                <!-- TODO: should use profile.arn as item-id but not idx, which will require more work to refactor auth flow code path -->
                <SelectableItem
                    v-for="(profile, idx) in availableRegionProfiles"
                    :key="profile.arn"
                    @toggle="toggleItemSelection"
                    :item-id="idx"
                    :item-title="`${profile.name}`"
                    :item-sub-title="`${profile.region}`"
                    :item-text="`Account: ${profile.description}`"
                    :isSelected="selectedRegionProfileIndex === idx"
                    :class="['option', { selected: selectedRegionProfileIndex === idx }]"
                ></SelectableItem>
            </div>

            <div v-if="errorMessage" id="error-message">
                We couldn't load your Q Developer profiles. Please try again.
            </div>

            <div>
                <template v-if="errorMessage">
                    <button id="reload" class="continue-button" v-on:click="listAvailableProfiles">Try again</button>
                    <button id="signout" v-on:click="signout">Sign Out</button>
                </template>
                <template v-else>
                    <button class="continue-button" v-on:click="onClickContinue()">Continue</button>
                </template>
            </div>
        </div>
    </div>
</template>
<script lang="ts">
import { PropType, defineComponent } from 'vue'
import { FeatureId } from './types'
import { WebviewClientFactory } from '../../../webviews/client'
import { CommonAuthWebview } from './backend'
import SelectableItem from './selectableItem.vue'
import { RegionProfile } from '../../../codewhisperer/models/model'

const client = WebviewClientFactory.create<CommonAuthWebview>()

const FeatureNames: { [key in FeatureId]: string } = {
    AMAZONQ: 'Amazon Q',
    TOOLKIT: 'Toolkit',
} as const
type FeatureName = (typeof FeatureNames)[keyof typeof FeatureNames]

export default defineComponent({
    name: 'RegionProfileSelector',
    components: {
        SelectableItem,
    },
    data() {
        return {
            name: '' as FeatureName,
            errorMessage: '' as String,
            doShow: false,
            availableRegionProfiles: [] as RegionProfile[],
            selectedRegionProfileIndex: 0,
        }
    },
    props: {
        app: {
            type: String as PropType<FeatureId>,
            required: true,
        },
        state: {
            type: String,
            required: true,
        },
    },
    async created() {
        this.doShow = true
    },
    async beforeMount() {
        await this.listAvailableProfiles()
    },
    methods: {
        toggleItemSelection(itemId: number) {
            this.selectedRegionProfileIndex = itemId
        },
        onClickContinue() {
            if (this.availableRegionProfiles[this.selectedRegionProfileIndex] !== undefined) {
                const selectedProfile = this.availableRegionProfiles[this.selectedRegionProfileIndex]
                client.selectRegionProfile(selectedProfile)
            } else {
                // TODO: handle error
            }
        },
        async signout() {
            client.emitUiClick('auth_signout')
            await client.signout()
        },
        async listAvailableProfiles() {
            this.errorMessage = ''
            const r = await client.listRegionProfiles()
            if (typeof r === 'string') {
                this.errorMessage = r
            } else {
                this.availableRegionProfiles = r
                // auto select and bypass this profile view if profile count === 1
                if (this.availableRegionProfiles.length === 1) {
                    await client.selectRegionProfile(this.availableRegionProfiles[0])
                }
            }
        },
    },
})
</script>
<style scoped>
@import './base.css';

/* TODO: clean up these CSS entries */
#profile-selector-container {
    height: auto;
    margin: auto;
    position: absolute;
    top: var(--auth-container-top);
    width: 90vw;
    max-width: 400px;
}

#content-container {
    display: flex;
    flex-direction: column;
    /* All items are centered vertically */
    justify-content: space-between;
    /** The overall height of the container, then spacing is automatic between child elements */
    /* height: 7rem; */
    align-items: center;
}

#content-container > * {
    width: 100%;
    max-width: 260px;
}

#icon-container {
    display: flex;
    flex-direction: column;
    /* justify-content: center; */
    align-items: center;
}

.text-container {
    display: flex;
    flex-direction: column;
    margin-bottom: 1rem;
    margin-left: 2rem;
    margin-top: 1rem;
}

#title {
    font-weight: bold;
    margin-bottom: 1.5px;
}

.description {
    margin-top: 0.5rem;
    font-weight: normal;
}

#error-message {
    text-align: center;
    font-size: var(--font-size-base);
}

body.vscode-high-contrast-light .continue-button {
    background-color: var(--vscode-button-background);
    color: white;
}

body.vscode-high-contrast-light .continue-button:disabled {
    background-color: #6f6f6f;
    color: var(--vscode-input-background);
}

.options {
    text-align: center;
    align-items: center;
}

.option {
    width: 100%;
    margin-bottom: 7px;
    cursor: pointer;
}

button#signout {
    cursor: pointer;
    color: var(--vscode-textLink-foreground);
    border: none;
    background: none;
    user-select: none;
    margin-top: 0.5rem;
}
</style>
