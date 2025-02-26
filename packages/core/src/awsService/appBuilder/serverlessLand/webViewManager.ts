/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
export class WebviewService {
    constructor() {}

    public static getWebviewContent(url: string) {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${url}; style-src 'unsafe-inline';">
                <style>
                    body, html {
                        margin: 0;
                        padding: 0;
                        width: 100%;
                        height: 100vh;
                        overflow: hidden;
                    }
                    iframe {
                        width: 100%;
                        height: 100%;
                        border: none;
                    }
                </style>
            </head>
            <body>
                <iframe src="${url}" frameborder="0" allowfullscreen></iframe>
            </body>
            </html>
        `
    }
}
