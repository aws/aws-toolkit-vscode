/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export type AuthFollowUpType = 'full-auth' | 're-auth' | 'missing_scopes' | 'use-supported-auth'

export const reauthenticateText = `You don't have access to Amazon Q. Please authenticate to get started.`

export const enableQText = `You haven't enabled Amazon Q in VSCode`

export const expiredText = `Your Amazon Q session has timed out. Re-authenticate to continue.`
