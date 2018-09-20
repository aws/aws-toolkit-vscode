/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export class BaseTemplates {
    static readonly SimpleHTML = `
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: https:; script-src vscode-resource: 'self' 'unsafe-eval'; style-src vscode-resource:;">
        </head>
            <body>
                <%= content %>
            </body>
        </html>`
}