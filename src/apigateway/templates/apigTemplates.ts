/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const APIG_REMOTE_INVOKE_TEMPLATE = `
    <h1>
        Invoke methods on <%= ApiName %> (<%= ApiId %>)
    </h1>
    <pre><%= ApiArn %></pre>
    <br />
    <div id="app">
        <h3>
            Select a resource:
        </h3>
        <select v-model="selectedApiResource" v-on:change="setApiResource">
            <option disabled value="">Select a resource</option>
            <% Resources.forEach(function(resource, key, map) { %>
            <% if (resource.resourceMethods === undefined) { %>
                <option disabled value="<%= resource.id %>"><%= resource.path %> -- No methods</option>
            <% } else {%>
                <option value="<%= resource.id %>"><%= resource.path %></option>
            <% }%>
            <% }); %>
        </select>
        <h3>
            Select a method:
        </h3>
        <select v-if="selectedApiResource" v-model="selectedMethod">
            <option disabled value="">Select a method</option>
            <option v-for="method in methods" v-bind:value="method">
                {{ method }}
            </option>
        </select>
        <select v-else>
            <option disabled value="">Select a resource first</option>
        </select>
        <br />
        <h3>
            Query string (optional)
        </h3>
        <input type="text" v-model="queryString">
        <br />
        <br />
        <textarea
            rows="20"
            cols="90"
            v-model="jsonInput"
        ></textarea>
        <br />
        <input type="submit" v-on:click="sendInput" value="Invoke" :disabled="isLoading">
        <br />
        <p v-if="errors.length">
        <b>Please correct the following error(s):</b>
        <ul>
          <li v-for="error in errors">{{ error }}</li>
        </ul>
        </p>
    </div>
    <% Libraries.forEach(function(lib) { %>
        <script src="<%= lib %>"></script>
    <% }); %>
    <% Scripts.forEach(function(scr) { %>
        <script src="<%= scr %>"></script>
    <% }); %>
    `
