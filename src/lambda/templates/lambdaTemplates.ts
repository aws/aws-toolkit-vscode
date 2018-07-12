export class LambdaTemplates {
    static readonly InvokeInputTemplate = `
    <h1> 
        Include input payload with <%= FunctionName %>
    </h1>
    <div id="app">
        <h3>
            Use an input template:
        </h3>
        <select v-model="selectedSampleRequest" v-on:change="newSelection">
            <option disabled value="">Select a sample</option>
            <% InputSamples.forEach(function(el) { %>
                <option value="<%= el.filename %>"><%= el.name %></option>
            <% }); %>
        </select>
        <br />
        <textarea 
            rows="30"
            cols="90"
            v-model="sampleText"
        ></textarea>
        <br />
        <input type="submit" v-on:click="sendInput" value="Invoke lambda">
    </div>
    <% Libraries.forEach(function(lib) { %>
        <script nonce="<%= lib.Nonce %>" src="<%= lib.Uri %>"></script>
    <% }); %>
    <% Scripts.forEach(function(scr) { %>
        <script nonce="<%= scr.Nonce %>" src="<%= scr.Uri %>"></script>
    <% }); %>
    `;
    static readonly InvokeTemplate = `
    <h1>
        Invoking <%= FunctionName %>...
    </h1>
    <% if (Error) { %>
        <div>
            <p>Something went wrong.</p>
            <pre><%= Error %></pre>
        </div>
    <% } else { %>
        <p>Status Code: <%= StatusCode %></p>
        <p>Response: 
            <pre><%- JSON.stringify(JSON.parse(Payload), null, 4) %></pre>
        </p>
        <p>Logs: 
            <pre><%= LogResult %></pre>
        </p>
    <% } %>
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