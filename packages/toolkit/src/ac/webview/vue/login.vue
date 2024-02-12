<template>
    <div v-bind:class="[disabled ? 'disabled-form' : '']" class="auth-container" @click="handleDocumentClick">
        <div class="logoIcon">
            <!-- Icon -->
            <svg width="54" height="54" viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M27.7667 29.1198L29.5872 29.751L25.5655 41.344L23.7449 40.7127L27.7667 29.1198ZM22.1624 32.1488L19.2018 35.1346L22.1037 38.1145L20.7216 39.4599L17.1606 35.8015C16.7943 35.4246 16.7972 34.8233 17.1673 34.4503L20.7939 30.7919L22.1624 32.1488ZM36.4828 34.4503C36.8529 34.8233 36.8558 35.4246 36.4896 35.8015L32.9266 39.4599L31.5455 38.1145L34.4474 35.1346L31.4877 32.1488L32.8562 30.7919L36.4828 34.4503ZM43.3987 38.3718L40.0757 40.0323C39.75 40.1962 39.5437 40.5296 39.5437 40.8949V46.6369L31.72 51.4518L27.9787 49.3152V44.3326H26.0512V49.3152L22.3099 51.4518L14.4862 46.6369V40.8939C14.4862 40.5287 14.2799 40.1952 13.9532 40.0323L10.6312 38.3708L10.6302 34.618L10.6312 30.4064L14.1064 27.758C14.3455 27.5758 14.4862 27.2925 14.4862 26.9918V21.6372L21.6507 17.4584L26.0512 19.915V26.0213H27.9787V19.915L32.3782 17.4584L39.5437 21.6372V26.9918C39.5437 27.2925 39.6835 27.5758 39.9225 27.758L43.3987 30.4054L43.3997 34.618L43.3987 38.3718ZM44.9465 29.1622L41.4712 26.5138V21.084C41.4712 20.7419 41.2891 20.4248 40.9932 20.2513L32.8745 15.5164C32.5796 15.3439 32.2153 15.341 31.9195 15.5068L27.0149 18.2458L22.1104 15.5068C21.8126 15.342 21.4493 15.3439 21.1553 15.5164L13.0367 20.2513C12.7398 20.4248 12.5587 20.7419 12.5587 21.084V26.5147L9.0824 29.1622C8.84339 29.3443 8.70365 29.6286 8.70365 29.9293L8.70268 34.618L8.70365 38.9664C8.70365 39.3317 8.90989 39.6651 9.23564 39.829L12.5587 41.4895V47.1757C12.5587 47.5101 12.7312 47.8204 13.0164 47.9958L21.7866 53.3938C22.0863 53.5769 22.4622 53.5837 22.7696 53.4092L27.0149 50.9844L31.2593 53.4092C31.4077 53.494 31.5725 53.5364 31.7373 53.5364C31.9127 53.5364 32.0872 53.4882 32.2433 53.3938L41.0125 47.9958C41.2977 47.8204 41.4712 47.5101 41.4712 47.1757V41.4905L44.7933 39.829C45.12 39.6661 45.3262 39.3327 45.3262 38.9674L45.3272 34.618L45.3262 29.9284C45.3262 29.6277 45.1855 29.3443 44.9465 29.1622ZM17.3774 5.30064C17.3774 6.09862 16.7298 6.74627 15.9318 6.74627C15.1328 6.74627 14.4862 6.09862 14.4862 5.30064C14.4862 4.50169 15.1328 3.85501 15.9318 3.85501C16.7298 3.85501 17.3774 4.50169 17.3774 5.30064ZM12.5587 5.30064C12.5587 6.09862 11.911 6.74627 11.113 6.74627C10.3141 6.74627 9.6674 6.09862 9.6674 5.30064C9.6674 4.50169 10.3141 3.85501 11.113 3.85501C11.911 3.85501 12.5587 4.50169 12.5587 5.30064ZM7.7399 5.30064C7.7399 6.09862 7.09225 6.74627 6.29427 6.74627C5.49532 6.74627 4.84864 6.09862 4.84864 5.30064C4.84864 4.50169 5.49532 3.85501 6.29427 3.85501C7.09225 3.85501 7.7399 4.50169 7.7399 5.30064ZM1.95738 8.67377L1.9622 2.01713C1.9622 1.97473 2.01232 1.9275 2.08363 1.9275H51.9511C52.0224 1.9275 52.0725 1.97473 52.0725 2.01713V8.67377H1.95738ZM51.9511 0H2.07881C0.951225 0 0.0318052 0.904 0.0298777 2.01521L7.60558e-07 37.4938C-0.00096223 38.6002 0.912675 39.5061 2.04316 39.5138L5.81239 39.5119V37.5863L2.07689 37.5873C2.00653 37.5873 1.95738 37.5401 1.95738 37.4977L1.97955 10.6013H52.0725V37.4871C52.0725 37.5401 52.0166 37.5854 51.9511 37.5854L48.2175 37.5863V39.5138L51.9511 39.5129C53.0806 39.5129 54 38.6041 54 37.4871V2.01713C54 0.904963 53.0806 0 51.9511 0Z"
                    fill="url(#paint0_linear_227_4962)"
                />
                <defs>
                    <linearGradient
                        id="paint0_linear_227_4962"
                        x1="53.5957"
                        y1="-883.34"
                        x2="19.5336"
                        y2="-883.327"
                        gradientUnits="userSpaceOnUse"
                    >
                        <stop stop-color="#6EB1FF" />
                        <stop offset="1" stop-color="#DA8AF7" />
                    </linearGradient>
                </defs>
            </svg>
        </div>
        <template v-if="stage === 'START'">
            <div class="auth-container-section">
                <div class="title">Choose a sign-in option</div>
                <SelectableItem
                    v-for="item in items"
                    @toggle="toggleItemSelection"
                    :key="item.id"
                    :isSelected="selectedItem === item.id"
                    :itemId="item.id"
                    :itemText="item.text"
                    class="selectable-item"
                ></SelectableItem>

                <button
                    class="continue-button"
                    :disabled="selectedItem === 0"
                    v-on:click="handleContinueClickWhenStart()"
                >
                    Continue
                </button>
            </div>
        </template>

        <template v-if="stage === 'SSO_FORM'">
            <button class="black-button" @click="handleBackButtonClick">&#8592;</button>
            <div class="auth-container-section">
                <div class="title">Sign in with SSO</div>
                <div class="title">Start URL</div>
                <div class="title">URL for your organization, provided by an admin or help desk</div>
                <input type="text" id="startUrl" name="startUrl" /><br /><br />
                <div class="title">Region</div>
                <div class="title">AWS Region that hosts identity directory</div>
                <select id="regions" name="regions">
                    <option v-for="region in getRegions" :key="region.value" :value="region.value">
                        {{ region.label }}
                    </option>
                </select>
            </div>
        </template>
    </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import SelectableItem from './selectableItem.vue'
import { CommonAuthWebview } from './backend'
import { WebviewClientFactory } from '../../../webviews/client'

const client = WebviewClientFactory.create<CommonAuthWebview>()

/** Where the user is currently in the builder id setup process */
type Stage = 'START' | 'SSO_FORM' | 'CONNECTED'

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
                { id: 1, text: 'Create or sign-in using AWS Builder ID' },
                { id: 2, text: 'Single sign-on with AWS IAM Identity Center' },
            ],
            selectedItem: 0,
            stage: 'START' as Stage,
            regions: [] as string[],
            isConnected: false,
            builderIdCode: '',
            name: '',
            error: '' as string,
            submitButtonText: '' as string,
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
            this.stage = 'START'
        },
        handleContinueClickWhenStart() {
            if (this.selectedItem === 1) {
            } else if (this.selectedItem === 2) {
                this.stage = 'SSO_FORM'
            } else {
            }
        },
        getRegions(): { value: string; label: string }[] {
            return this.regions.map(i => ({ value: i, label: i }))
        },
        async fetchRegions() {
            console.log(`st regions`)
            const regions = await client.getRegions()
            console.log(`ed regions`)
            this.regions = regions
            console.log(regions)
        },
        async startSignIn() {},

        /** Updates the content of the form using the state data */
        async updateForm() {},
        async emitUpdate(cause?: string) {},
        async signout() {},
        showNodeInView() {},
    },
})
</script>

<style>
.selectable-item {
    margin-bottom: 10px;
    margin-top: 10px;
}
.continue-button {
    background-color: blue;
    color: white;
    width: 100%;
}
.continue-button:disabled {
    background-color: gray;
    color: white;
}
</style>
