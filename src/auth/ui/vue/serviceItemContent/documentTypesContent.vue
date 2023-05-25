<template>
    <div class="service-item-content-container border-common">
        <div class="service-item-content-container-title">Edit CloudFormation Templates</div>

        <div>
            <img src="https://i.stack.imgur.com/qvON5.png" />
        </div>

        <div>This is my description</div>

        <div>
            <a>Learn more about support for editing CloudFormation templates.</a>
        </div>

        <hr />
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import CredentialsForm from '../authForms/manageCredentials.vue'
import BaseServiceItemContent from './baseServiceItemContent.vue'

export default defineComponent({
    name: 'DocumentTypesContent',
    components: { CredentialsForm },
    extends: BaseServiceItemContent,
})
</script>

<style>
@import './baseServiceItemContent.css';
@import '../shared.css';
</style>
