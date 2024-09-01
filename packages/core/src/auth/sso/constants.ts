/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * For compatibility, this file should not import anything that cannot be used in
 * web, node, or vue.
 */

export const ssoUrlProtocolRegex = /^(https?:\/\/)/;

export const ssoUrlFormatRegex =
    /^(https?:\/\/(.+)\.awsapps\.com\/start|https?:\/\/identitycenter\.amazonaws\.com\/ssoins-[\da-zA-Z]{16})\/?#?$/

export const ssoUrlProtocolMessage =
    'URLs must start with http:// or https://. Example: https://d-xxxxxxxxxx.awsapps.com/start'

export const ssoUrlFormatMessage =
    'URLs must be in the following format. Example: https://d-xxxxxxxxxx.awsapps.com/start (trailing `/` or `/#` allowed)'

export const ssoUrlExistsMessage =
    'A connection for this start URL already exists. Sign out before creating a new one.'
