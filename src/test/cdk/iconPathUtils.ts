/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { cdk } from '../../cdk/globals'

export interface IconPath {
    light: vscode.Uri
    dark: vscode.Uri
}

export function setupTestIconPaths() {
    cdk.iconPaths.dark.cdk = '/icons/dark/cdk'
    cdk.iconPaths.light.cdk = '/icons/light/cdk'

    cdk.iconPaths.dark.cloudFormation = '/icons/dark/cloudformation'
    cdk.iconPaths.light.cloudFormation = '/icons/light/cloudformation'
}

export function clearTestIconPaths() {
    cdk.iconPaths.dark.cdk = ''
    cdk.iconPaths.light.cdk = ''

    cdk.iconPaths.dark.cloudFormation = ''
    cdk.iconPaths.light.cloudFormation = ''
}
