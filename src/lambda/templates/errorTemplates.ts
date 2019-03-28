/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

export class ErrorTemplates {
    public static readonly SHOW_ERROR_DETAILS = `
    <h1>
        ${localize('AWS.template.error.showErrorDetails.title',
                   'Error details for')} <%= parent.label %>
    </h1>
    <p>

    <h2>
        ${localize('AWS.template.error.showErrorDetails.errorCode',
                   'Error code')}
    </h2>
    <pre>
        <%= error.code %>
    </pre>

    <h2>
        ${localize('AWS.template.error.showErrorDetails.errorMessage',
                   'Error message')}
    </h2>
    <pre>
        <%= error.message %>
    </pre>

    <h2>
        ${localize('AWS.template.error.showErrorDetails.stackTrace',
                   'Stack trace')}
    </h2>
    <pre>
        <%= error.stack %>
    </pre>
    `
}
