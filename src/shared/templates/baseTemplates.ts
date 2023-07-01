/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export class BaseTemplates {
    public static readonly simpleHtml = `
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy"
                content="default-src 'none';
                img-src <%= cspSource %> https: data:;
                script-src <%= cspSource %> 'self';
                style-src <%= cspSource %>;"
            >
        </head>
            <body>
                <%= content %>
            </body>
        </html>`
}
