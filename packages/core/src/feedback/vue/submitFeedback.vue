/*! * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */

<template>
    <div>
        <div class="container button-container" style="justify-content: space-between">
            <h1>Feedback for {{ feedbackName }}</h1>
            <div id="error" v-if="error !== ''" style="margin-right: 10px">
                <strong>{{ error }}</strong>
            </div>
            <div>
                <input v-if="isSubmitting" type="submit" value="Submitting..." disabled />
                <input v-else type="submit" @click="submitFeedback" :disabled="comment.length > 2000" value="Send" />
            </div>
        </div>

        <h3 id="sentiment-heading">How was your experience?</h3>
        <div>
            <input id="positive-sentiment" type="radio" value="Positive" v-model="sentiment" />
            <label for="positive-sentiment"></label>
            <input id="negative-sentiment" type="radio" value="Negative" v-model="sentiment" />
            <label for="negative-sentiment"></label>
        </div>

        <h3 id="feedback-heading">Feedback</h3>

        <div>
            <div>
                <div style="margin-bottom: 10px">
                    <div>
                        <em
                            >Feedback is <b>anonymous</b>. If you need a reply,
                            <a href="https://github.com/aws/aws-toolkit-vscode/issues/new/choose"
                                >contact us on GitHub</a
                            >.</em
                        >
                    </div>
                    <br />
                    <div>
                        <em>
                            Don't add personally identifiable information (PII), confidential or sensitive information
                            in your feedback. Please remove any PII when sharing file paths, error messages, etc.
                        </em>
                        <div
                            style="float: right; font-size: smaller"
                            id="remaining"
                            :class="comment.length > 2000 ? 'exceeds-max-length' : ''"
                        >
                            {{ 2000 - comment.length }} characters remaining
                        </div>
                    </div>
                </div>
            </div>
            <textarea style="width: 100%; margin-bottom: 10px" rows="10" cols="90" v-model="comment"></textarea>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../webviews/client'
import saveData from '../../webviews/mixins/saveData'
import { FeedbackWebview } from './submitFeedback'

const client = WebviewClientFactory.create<FeedbackWebview>()

export default defineComponent({
    data() {
        return {
            comment: '',
            sentiment: '',
            isSubmitting: false,
            error: '',
            feedbackName: '',
        }
    },
    created() {
        this.getName()
    },
    methods: {
        async submitFeedback() {
            this.error = ''
            this.isSubmitting = true
            console.log('Submitting feedback...')
            // identifier to help us (internally) know that feedback came from either Amazon Q or AWS Toolkit
            // TODO: rework this and align with JetBrains?
            const resp = await client.submit({
                comment: this.feedbackName === 'Amazon Q' ? 'Amazon Q onboarding: ' + this.comment : this.comment,
                sentiment: this.sentiment,
            })

            this.error = resp ?? ''
            this.isSubmitting = false
        },
        async getName() {
            const fbName = await client.getFeedbackName()
            if (typeof fbName === 'string') {
                this.feedbackName = fbName
            }
        },
    },
    mixins: [saveData],
})
</script>
