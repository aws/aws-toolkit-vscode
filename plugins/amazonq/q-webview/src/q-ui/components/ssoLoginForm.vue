<!-- Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<template>
    <button class="back-button" @click="handleBackButtonClick" tabindex="-1">
        <svg width="24" height="24" viewBox="0 -3 13 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
                d="M4.98667 0.0933332L5.73333 0.786666L1.57333 4.94667H12.0267V5.96H1.57333L5.73333 10.0667L4.98667 10.8133L0.0266666 5.8V5.10667L4.98667 0.0933332Z"
                fill="#21A2FF"
            />
        </svg>
    </button>
    <div class="font-amazon" @keydown.enter="handleContinueClick">
        <div class="title bottom-small-gap">Sign in with SSO:</div>
        <div>
            <div class="title no-bold">Profile Name</div>
            <div class="hint">User-specified name used to label credentials locally</div>
            <input
                class="sso-profile font-amazon"
                type="text"
                id="ssoProfile"
                name="ssoProfile"
                v-model="ssoProfile"
                tabindex="0"
                v-autofocus
            />
        </div>
        <br/>
        <div>
            <div class="title no-bold">Start URL</div>
            <div class="hint">URL for your organization, provided by an admin or help desk</div>
            <input
                class="url-input font-amazon"
                type="text"
                id="startUrl"
                name="startUrl"
                @input="handleUrlInput"
                v-model="startUrl"
                tabindex="0"
            />
        </div>
        <br/>
        <div>
            <div class="title no-bold">Region</div>
            <div class="hint">AWS Region that hosts identity directory</div>
            <select
                class="region-select font-amazon"
                id="regions"
                name="regions"
                v-model="selectedRegion"
                @change="handleUrlInput"
                tabindex="0"
            >
                <option v-for="region in regions" :key="region.id" :value="region.id">
                    {{ `${region.name} (${region.id})` }}
                </option>
            </select>
        </div>
        <br/><br/>
        <button
            class="login-flow-button continue-button font-amazon"
            :disabled="!inputValid"
            v-on:click="handleContinueClick()"
            tabindex="-1"
        >
            Continue
        </button>
    </div>
</template>

<script lang="ts">
import {defineComponent} from 'vue'
import {Region} from "../../model";

function validateSsoUrlFormat(url: string) {
    const regex = /^https?:\/\/(.+)\.awsapps\.com\/start$/
    return regex.test(url)
}

export default defineComponent({
    name: "ssoForm",
    data() {
        return {
            ssoProfile: "",
            startUrl: "",
            selectedRegion: "",
            inputValid: false,
        }
    },
    computed: {
        regions(): Region[] {
            return this.$store.state.ssoRegions
        },
    },
    methods: {
        handleUrlInput() {
            this.inputValid = !!(this.startUrl && validateSsoUrlFormat(this.startUrl) && this.selectedRegion != "");
        },
        handleBackButtonClick() {
            this.$emit('backToMenu')
        },
        async handleContinueClick() {
            if (!this.inputValid) return
            window.ideApi.postMessage({command: 'loginIdC', url: this.startUrl, region: this.selectedRegion})
            this.$emit('stageChanged', 'AUTHENTICATING')
        },
    },
    mounted() {
        document.getElementById("ssoProfile")?.focus()
    }
})
</script>

<style scoped lang="scss">
.hint {
    color: #909090;
    margin-bottom: 5px;
    margin-top: 5px;
    font-size: 12px;
}

.sso-profile, .url-input, .region-select {
    width: 100%;
    height: 40px;
    border-radius: 4px;
}

.sso-profile, .url-input {
    padding-left: 10px;
    box-sizing: border-box;
}

.region-select {
    padding-left: 6px;
}

/* Theme specific styles */
body.jb-dark {
    .url-input, .region-select, .sso-profile {
        background-color: #252526;
        color: white;
        border: none;
    }
}

body.jb-light {
    .url-input, .region-select, .sso-profile {
        color: black;
        border: 1px solid #c9ccd6;
    }
}
</style>
