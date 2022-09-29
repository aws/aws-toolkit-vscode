/*! * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */

<template>
    <div>
        <div class="container button-container" style="justify-content: space-between">
            <h1>Feedback for AWS Toolkit</h1>
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
                    <div
                        style="float: right; font-size: smaller"
                        id="remaining"
                        :class="comment.length > 2000 ? 'exceeds-max-length' : ''"
                    >
                        {{ 2000 - comment.length }} characters remaining
                    </div>
                    <div>
                        <em
                            >Feedback is <b>anonymous</b>. If you need a reply,
                            <a href="https://github.com/aws/aws-toolkit-vscode/issues/new/choose"
                                >contact us on GitHub</a
                            >.</em
                        >
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
        }
    },
    methods: {
        async submitFeedback() {
            this.error = ''
            this.isSubmitting = true
            console.log('Submitting feedback...')

            const resp = await client.submit({
                comment: this.comment,
                sentiment: this.sentiment,
            })

            this.error = resp ?? ''
            this.isSubmitting = false
        },
    },
    mixins: [saveData],
})
</script>
