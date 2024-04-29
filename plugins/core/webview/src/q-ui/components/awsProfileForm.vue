<!-- Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<template>
    <div class="font-amazon" @keydown.enter="handleContinueClick">
        <div class="title no-bold">Profile Name</div>
        <div class="hint">The identifier for these credentials</div>
        <input class="iamInput font-amazon" type="text" id="profileName" name="profileName" v-model="profileName"/>

        <br/><br/>
        <div class="title no-bold">Access Key</div>
        <input class="iamInput font-amazon" type="text" id="accessKey" name="accessKey" v-model="accessKey"/>

        <br/><br/>
        <div class="title no-bold">Secret Key</div>
        <input class="iamInput font-amazon" type="text" id="secretKey" name="secretKey" v-model="secretKey"/>

        <br/><br/>
        <button
            class="login-flow-button continue-button"
            :disabled="profileName.length <= 0 || accessKey.length <= 0 || secretKey.length <= 0"
            v-on:click="handleContinueClick()"
        >
            Continue
        </button>
    </div>
</template>

<script lang="ts">
import {defineComponent} from 'vue'
import {LongLivedIAM} from '../../model'

export default defineComponent({
    name: "awsProfileForm",
    data() {
        return {
            profileName: '',
            accessKey: '',
            secretKey: '',
        }
    },
    methods: {
        async handleContinueClick() {
            this.$emit('login',  new LongLivedIAM(this.profileName, this.accessKey, this.secretKey))
        },
    },
    mounted() {
        document.getElementById("profileName")?.focus()
    }
})
</script>

<style scoped lang="scss">
.back-button {
    background: none;
    border: none;
    cursor: pointer;
    color: white;
    font-size: 30px;
}

.hint {
    color: #909090;
    margin-bottom: 5px;
    margin-top: 5px;
    font-size: 12px;
}

/* Theme specific styles */
body.jb-dark {
    .iamInput {
        background-color: #252526;
        color: white;
        border: none;
    }
}

body.jb-light {
    .iamInput {
        color: black;
        border: 1px solid #c9ccd6;
    }
}
</style>
