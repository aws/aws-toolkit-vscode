/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint @typescript-eslint/naming-convention: 0 */
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

    AWS_ACCESS_KEY_ID?: string
    AWS_SECRET_ACCESS_KEY?: string
    AWS_SESSION_TOKEN?: string
    AWS_REGION?: string

    AWS_CONTAINER_CREDENTIALS_RELATIVE_URI?: string
    AWS_CONTAINER_CREDENTIALS_FULL_URI?: string
    AWS_DEFAULT_REGION?: string

    [key: string]: string | boolean | undefined
}
