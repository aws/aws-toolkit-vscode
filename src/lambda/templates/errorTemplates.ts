/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export class ErrorTemplates {
    public static readonly SHOW_STACK_TRACE = `
    <h1>
        Stack Trace for <%= parent.label %>
    </h1>
    <p>
    <pre>
        <%= error.stack %>
    </pre>
    `
}
