/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

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

        <h3 id="feedback-heading">Please enter your feedback</h3>
        <div>
            <textarea
                rows="20"
                cols="90"
                v-model="comment"
            ></textarea>
            <p id="remaining" :class="comment.length > 2000 ? 'exceeds-max-length' : ''">{{ comment.length }} / 2000 character(s) remaining</p>
        </div>

        <p>Have an issue or feature request?
        <a href="https://github.com/aws/aws-toolkit-vscode/issues/new/choose">Talk to us on GitHub instead!</a></p>

        <input v-if="isSubmitting" type="submit" value="Submitting..." disabled>
        <input v-else type="submit" @click="submitFeedback" :disabled="comment.length === 0 || comment.length > 2000" value="Submit">

        <div id="error" v-if="error !== ''">
            <strong>{{ error }}</strong>
        </div>
    </div>
    <% Libraries.forEach(function(lib) { %>
        <script nonce="<%= lib.nonce %>" src="<%= lib.uri %>"></script>
    <% }); %>
    <% Scripts.forEach(function(scr) { %>
        <script nonce="<%= scr.nonce %>" src="<%= scr.uri %>"></script>
    <% }); %>
    <% Stylesheets.forEach(function(scr) { %>
        <link rel="stylesheet" type="text/css" href="<%= scr.uri %>">
    <% }); %>
    `
}
