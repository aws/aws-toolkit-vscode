/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export class ErrorTemplates {
    public static readonly ERROR_INFORMATION = `
    <h1>
        Error information for <%= parent.label %>
    </h1>
    <p>

    <h2>
        Error code
    </h2>
    <pre>
        <%= error.code %>
    </pre>

    <h2>
        Error message
    </h2>
    <pre>
        <%= error.message %>
    </pre>

    <h2>
        Stack trace
    </h2>
    <pre>
        <%= error.stack %>
    </pre>
    `
}
