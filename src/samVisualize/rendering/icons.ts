/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { readdirSync } from 'fs'
import { join } from 'path'
import * as vscode from 'vscode'
/**
 * Creates a map between a resource type and a webview URI pointing to a corresponding svg icon
 * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-template-resource-type-ref.html
 * @param iconDir The path to the directory holding icons
 * @param webview The webview from which URIs pointing to svg icons is produced
 * @returns an IconURIMap mapping each svg icon in `iconDir`
 */
export function generateIconsMap(iconDir: string, webview: vscode.Webview): { [resourceType: string]: string } {
    const iconsMap: { [resourceType: string]: string } = {}
    const icons = readdirSync(iconDir)

    for (const icon of icons) {
        const vscfile = vscode.Uri.file(join(iconDir, icon))
        // Convert the icon name from <a>-<b>-<c>.svg to <a>::<b>::<c>
        // to match with CloudFormation resource names, which will be used as keys to retrieve the paths.
        // See https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-template-resource-type-ref.html
        // Note: images will always be in .svg format

        // Since CloudFormation resource names will always be lower case, we convert the key to lower case here so that
        // icon names can be case insensitive.
        const resourceKey = icon.replace('-', '::').replace('.svg', '').toLowerCase()

        iconsMap[resourceKey] = webview.asWebviewUri(vscfile).toString()
    }

    // Include an icon to default to when no other icon matches.
    iconsMap['default'] = webview.asWebviewUri(vscode.Uri.file(join(iconDir, 'default.svg'))).toString()

    return iconsMap
}
