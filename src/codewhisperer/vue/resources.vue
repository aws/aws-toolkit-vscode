<!-- This Vue File provides Documentation and Feedback for CodeWhisperer-->
<template>
    <div class="resourcesDiv">
        <div class="resourcesTitle">Resources</div>
        <div>
            <div class="DocumentationDiv">
                <svg width="13" height="14" viewBox="0 0 13 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                        d="M11.7067 3.26667L12.0267 4.01333V12.9733L11.0133 13.9867H2L0.986667 12.9733V0.973333L2 0.0133333H8.02667L8.72 0.28L11.7067 3.26667ZM11.0133 12.9733V4.97333H7.01333V0.973333H2V12.9733H11.0133ZM8.02667 4.01333H11.0133L8.02667 0.973333V4.01333Z"
                        fill="#C5C5C5"
                    />
                </svg>
                <div>
                    <a
                        class="DocumentationLink"
                        href="https://docs.aws.amazon.com/codewhisperer/latest/userguide/features.html"
                        @click="emitUiClick('codewhisperer_Resources_Documentation')"
                        >Documentation</a
                    >
                </div>
            </div>
            <div class="DocumentationDiv">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                        d="M13.5067 0.973333L13.9867 1.50667V10.52L13.5067 11H6.73333L3.85333 13.88L3 13.5067V11H0.493333L0.0133333 10.52V1.50667L0.493333 0.973333H13.5067ZM13.0267 9.98667V1.98667H1.02667V9.98667H3.48L4.01333 10.52V12.28L6.14667 10.1467L6.52 9.98667H13.0267Z"
                        fill="#C5C5C5"
                    />
                </svg>
                <div class="FeedbackPageLink" @click="onClick">Provide Feedback</div>
            </div>
        </div>
    </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import { CodeWhispererWebview } from './backend'
import { WebviewClientFactory } from '../../webviews/client'
import TelemetryClient from '../../codewhisperer/vue/telemetry.vue'

const client = WebviewClientFactory.create<CodeWhispererWebview>()

export default defineComponent({
    name: 'Resources',
    extends: TelemetryClient,
    data() {
        return {
            feedback: false,
        }
    },
    methods: {
        onClick() {
            client.emitUiClick('codewhisperer_Resources_Feedback')
            client.openFeedBack() //Opens CodeWhisperer Feedback Form
        },
    },
})
</script>
<style>
.resourcesDiv {
    border: 1px solid #424750;
    padding: 20px;
    border-radius: 10px;
    width: 87%;
    /* width: 305px; */
    margin-bottom: 30px;
}
.resourcesTitle {
    font-size: 16px;
    font-weight: 700;
    font-family: Verdana;
    line-height: 24px;
    letter-spacing: 0em;
    text-align: left;
    padding-right: 5px;
}
.DocumentationDiv {
    display: flex;
    flex-direction: row;
    align-items: center;
    padding-top: 10px;
    padding-right: 10px;
    gap: 10px;
}
.DocumentationLink {
    font-family: Verdana;
    font-size: 14px;
    font-weight: 510;
    line-height: 21px;
    letter-spacing: 0em;
    text-align: left;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    text-decoration: none;
}
.DocumentationLink:hover {
    text-decoration: none;
    color: var(--vscode-descriptionForeground);
}

.FeedbackPageLink {
    font-family: Verdana;
    font-size: 14px;
    font-weight: 510;
    line-height: 21px;
    letter-spacing: 0em;
    text-align: left;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
}
</style>
