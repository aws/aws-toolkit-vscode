/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * For compatibility, this file should not import anything that cannot be used in
 * web, node, or vue.
 */

export const ssoUrlFormatRegex =
    /^(https?:\/\/(.+)\.awsapps\.com\/start|https?:\/\/identitycenter\.amazonaws\.com\/ssoins-[\da-zA-Z]{16})\/?$/

export const ssoUrlFormatMessage =
    'URLs must start with http:// or https://. Example: https://d-xxxxxxxxxx.awsapps.com/start'
