/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export class StepFunctionsTemplates {
    public static readonly EXECUTE_TEMPLATE = `
    <h1>
        Start Execution: <%= StateMachineName %>
    </h1>
    <div id="app">
        <div>
            <label class="input-header">
                Execution Input
            </label>
        </div>
        <br />
        <div>
            <input type="radio" v-model="inputChoice" value="textarea" checked>
            <label for="textarea">
                    Provide JSON
            </label>
        </div>
        <div>
            <input type="radio" v-model="inputChoice" value="file">
            <label for="file">
                    Select a file
            </label>
            <br />
            <br />
            <div :style="{visibility: fileInputVisible ? 'visible' : 'hidden'}">
                <label class="custom-file-upload" >
                    <input type="file" @change="processFile($event)"/>
                    Choose File
                </label>
                <span class="custom-file-name">{{ selectedFile }}</span>
            </div>
        </div>
        <br />
        <br />
        <div :style="{visibility: textAreaVisible ? 'visible' : 'hidden'}">
            <textarea rows=10 v-model="executionInput" v-bind:readonly="inputChoice == 'file'" v-bind:placeholder="placeholderJson"></textarea>
        </div>
        <br />
        <input type="submit" v-on:click="sendInput" value="Execute">
        <br />
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
