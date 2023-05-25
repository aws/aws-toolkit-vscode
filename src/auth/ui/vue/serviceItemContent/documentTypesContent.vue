<template>
    <div class="service-item-content-container border-common">
        <div class="service-item-content-container-title">Edit CloudFormation Templates</div>

        <div>
            <img
                src="https://d1.awsstatic.com/developer-tools/01-Toolkit-for-VS-Code-Create-SAM-App.81c8c18274f2062516ba859ed97d61c4cab5ee98.png"
            />
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
