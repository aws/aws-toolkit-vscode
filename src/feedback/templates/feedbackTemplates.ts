/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// vscode theme color reference:
// https://code.visualstudio.com/api/references/theme-color
export class FeedbackTemplates {
    public static readonly SUBMIT_TEMPLATE = `
    <div id="app">
        <h1>Feedback for AWS Toolkit</h1>

        <h3 id="sentiment-heading">How was your experience?</h3>
        <div>
            <input id="positive-sentiment" type="radio" value="Positive" v-model="sentiment">
            <label for="positive-sentiment"></label>
            <input id="negative-sentiment" type="radio" value="Negative" v-model="sentiment">
            <label for="negative-sentiment"></label>
        </div>

        <h3 id="feedback-heading">Feedback</h3>

        <div>
            <textarea
                style="width:100%"
                rows="10"
                cols="90"
                v-model="comment"
            ></textarea>
            <div>
                <div style="float: right; font-size: smaller;" id="remaining" :class="comment.length > 2000 ? 'exceeds-max-length' : ''">{{ 2000 - comment.length }} characters remaining</div>
                <div>
                    <em>Feedback is <b>anonymous</b>. If you need a reply, <a href="https://github.com/aws/aws-toolkit-vscode/issues/new/choose">contact us on GitHub</a>.</em>
                </div>
            </div>
        </div>

        <p>
            <input v-if="isSubmitting" type="submit" value="Submitting..." disabled>
            <input v-else type="submit" @click="submitFeedback" :disabled="comment.length === 0 || comment.length > 2000  || sentiment === ''" value="Submit">
        </p>

        <div id="error" v-if="error !== ''">
            <strong>{{ error }}</strong>
        </div>
    </div>
    <% Libraries.forEach(function(lib) { %>
        <script src="<%= lib %>"></script>
    <% }); %>
    <% Scripts.forEach(function(scr) { %>
        <script src="<%= scr %>"></script>
    <% }); %>
    <% Stylesheets.forEach(function(scr) { %>
        <link rel="stylesheet" type="text/css" href="<%= scr %>">
    <% }); %>
    `
}
