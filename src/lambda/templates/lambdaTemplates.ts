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
        <script nonce="<%= lib.nonce %>" src="<%= lib.uri %>"></script>
    <% }); %>
    <% Scripts.forEach(function(scr) { %>
        <script nonce="<%= scr.nonce %>" src="<%= scr.uri %>"></script>
    <% }); %>
    `
    public static readonly GET_CONFIG_TEMPLATE = `
    <h1>
        Configuration for <%= FunctionName %>...
    </h1>
    <p>Function Name: <%= FunctionName %></p>
    <p>Function Arn: <%= FunctionArn %>
    <p>Description: <%= Description %>
    <p>Handler: <%= Handler %>
    <p>Last Modified: <%= LastModified %>
    <p>Memory Size: <%= MemorySize %>
    <p>Role: <%= Role %>
    <p>Timeout: <%= Timeout %>
    <p>Version: <%= Version %>
    `
}

export class LambdaPolicyTemplates {
    // This is the constant view frame, regardless of view state
    public static readonly OUTER_TEMPLATE = String.raw`
    <h1>
        Lambda Function Policy: <%= FunctionName %>
    </h1>
    <%= innerContent %>
    `
    public static readonly INNER_TEMPLATE_LOADING = String.raw`
    <h2>
        Loading...
    </h2>
    `
    public static readonly INNER_TEMPLATE_POLICY = String.raw`
    <p>Policy:
        <pre><%- Policy %></pre>
    </p>
    `
    public static readonly INNER_TEMPLATE_ERROR = String.raw`
    <p>Error getting Lambda Function Policy:
        <ul>
            <li>Code: <pre><%= ErrorCode %></pre></li>
            <li>Message: <pre><%= ErrorMessage %></pre></li>
        </ul>
    </p>
    `
}
