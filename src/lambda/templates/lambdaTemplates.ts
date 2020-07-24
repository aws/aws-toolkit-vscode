/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export class LambdaTemplates {
    public static readonly INVOKE_TEMPLATE = `
    <h1>
        Invoke function <%= FunctionName %>
    </h1>
    <div id="app">
        <h3>
            Select a file to use as payload:
        </h3>
        <input type="file" @change="processFile($event)">
        <br />
        <h3>
            Or, use a sample request payload from a template:
        </h3>
        <select v-model="selectedSampleRequest" v-on:change="newSelection">
            <option disabled value="">Select an example input</option>
            <% InputSamples.forEach(function(el) { %>
                <option value="<%= el.filename %>"><%= el.name %></option>
            <% }); %>
        </select>
        <br />
        <br />
        <textarea
            rows="20"
            cols="90"
            v-model="sampleText"
        ></textarea>
        <br />
        <input type="submit" v-on:click="sendInput" value="Invoke">
        <br />
    </div>
    <% Libraries.forEach(function(lib) { %>
        <script src="<%= lib %>"></script>
    <% }); %>
    <% Scripts.forEach(function(scr) { %>
        <script src="<%= scr %>"></script>
    <% }); %>
    `
}
