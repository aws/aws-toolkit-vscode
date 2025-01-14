/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * For compatibility, this file should not import anything that cannot be used in
 * web, node, or vue.
 */

export const builderIdStartUrl = 'https://view.awsapps.com/start'
export const internalStartUrl = 'https://amzn.awsapps.com/start'

/**
 * Doc: https://docs.aws.amazon.com/singlesignon/latest/userguide/howtochangeURL.html
 */
export const ssoUrlFormatRegex =
    /^(https?:\/\/(.+)\.awsapps\.com\/start|https?:\/\/identitycenter\.amazonaws\.com\/ssoins-[\da-zA-Z]{16})\/?$/

/**
 * It is possible for a start url to be a completely custom url that redirects to something that matches the format
 * below, so this message is only a warning.
 */
export const ssoUrlFormatMessage =
    'URL possibly invalid. It typically follows the pattern: https://xxxxxxxxxx.awsapps.com/start'
