export class LambdaTemplates {
    static readonly InvokeTemplate = `
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
        <h3 v-if="isLoading">Loading response...</h3>
        <div v-if="showResponse">
            <h1>
            Function output
            </h1>
            <div v-if="error">
            <p>Something went wrong.</p>
            <pre>{{ error }}</pre>
            </div>
            <div v-else>
                <div>
                    <p>Status Code: {{statusCode}}</p>
                    <p>Payload:
                        <pre>{{ payload }}</pre>
                    </p>
                </div>
                <div>
                    <h2>Logs</h2>
                    <pre>{{ logs }}</pre>
                </div>
            </div>
        </div>
    </div>
    <% Libraries.forEach(function(lib) { %>
        <script nonce="<%= lib.Nonce %>" src="<%= lib.Uri %>"></script>
    <% }); %>
    <% Scripts.forEach(function(scr) { %>
        <script nonce="<%= scr.Nonce %>" src="<%= scr.Uri %>"></script>
    <% }); %>
    `;
    static readonly GetPolicyTemplate = `
    <h1>
        Policy for <%= FunctionName %>...
    </h1>
    <p>Policy:
        <pre><%- JSON.stringify(JSON.parse(Policy), null, 4) %></pre>
    </p>
    `;
    static readonly GetConfigTemplate = `
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
    `;
}