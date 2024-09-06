/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export type AuthFollowUpType = 'full-auth' | 're-auth' | 'missing_scopes' | 'use-supported-auth'

export type AuthMessageData = {
    message: string
}

const reauthenticateData: AuthMessageData = {
    message: `You don't have access to Amazon Q. Please authenticate to get started.`,
}

const enableQData: AuthMessageData = {
    message: `You haven't enabled Amazon Q in VSCode`,
}

const expiredData: AuthMessageData = {
    message: `Your Amazon Q session has timed out. Re-authenticate to continue.`,
}

export const AuthMessageDataMap: Record<AuthFollowUpType, AuthMessageData> = {
    'full-auth': reauthenticateData,
    're-auth': reauthenticateData,
    missing_scopes: enableQData,
    'use-supported-auth': expiredData,
}
