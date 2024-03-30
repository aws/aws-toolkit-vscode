<!-- Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<template>
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
        <br/><br/>
        <div class="title">Region</div>
        <div class="hint">AWS Region that hosts identity directory</div>
        <select class="regionSelect" id="regions" name="regions" v-model="selectedRegion">
            <option v-for="region in regions" :key="region.id" :value="region.id">
                {{ `${region.name} (${region.id})` }}
            </option>
        </select>
        <br/><br/>
        <button class="continue-button" :disabled="!urlValid" v-on:click="handleContinueClick()">
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
            startUrl: "",
            selectedRegion: "",
            urlValid: false,
        }
    },
    computed: {
        regions(): Region[] {
            return this.$store.state.ssoRegions
        }
    },
    methods: {
        handleUrlInput() {
            if (this.startUrl && validateSsoUrlFormat(this.startUrl)) {
                this.urlValid = true
            } else {
                this.urlValid = false
            }
        },
        handleBackButtonClick() {
            this.$emit('backToMenu')
        },
        async handleContinueClick() {
            window.ideApi.postMessage({command: 'loginIdC', url: this.startUrl, region: this.selectedRegion})
            this.$emit('stageChanged', 'AUTHENTICATING')
        },
    },
})
</script>

<style scoped>
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
    font-size: 15px;
    font-weight: bold;
    color: white;
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

</style>
