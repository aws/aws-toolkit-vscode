/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export class SchemaTemplates {
    public static readonly SEARCH_TEMPLATE = `
    <h1>
        <%= Header %>
    </h1>
    <div id="app">
    <div id="search_input">
        <input  type="search" v-model="searchText" placeholder="<%= SearchInputPlaceholder %>">
    </div>
    <div id="result_content">
        <select id="searchList" v-model="selectedSchema" v-on:change="userSelectedSchema" size=100>
            <option disabled value="">{{searchProgressInfo}}</option>
            <option v-for="result in searchResults" :value="result">{{result.Title}}</option>
        </select>

        <div id="schemaContent_versionDropdown">
        <select id ='versionList' v-model="selectedVersion" v-on:change="userSelectedVersion" >
            <option v-for="result in schemaVersions" :value="result"><%= VersionPrefix %> {{result}}</option>
        </select>
        <textarea readonly v-model="schemaContent"></textarea>
        </div>

    </div>

    <input type="submit" :disabled="downloadDisabled" v-on:click="downloadClicked" value="Download Code Bindings">
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
