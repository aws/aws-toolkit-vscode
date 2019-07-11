/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface EnvironmentVariables {
    HOME?: string
    USERPROFILE?: string
    HOMEPATH?: string
    HOMEDRIVE?: string
    PATH?: string

    PROGRAMFILES?: string

    VSCODE_NLS_CONFIG?: string
    AWS_SDK_LOAD_CONFIG?: boolean | string
    AWS_SHARED_CREDENTIALS_FILE?: string
    AWS_CONFIG_FILE?: string

    [key: string]: string | boolean | undefined
}
