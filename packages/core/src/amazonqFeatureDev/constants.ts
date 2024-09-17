/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodeReference } from '../amazonq/webview/ui/connector'
import { LicenseUtil } from '../codewhisperer/util/licenseUtil'

/**
 * The scheme name for virtual documents in Amazon Q Feature Development.
 * @type {string}
 */
export const featureDevScheme = 'aws-featureDev'

/**
 * Identifier for routing chat messages to Feature Development.
 * @type {string}
 */
export const featureDevChat = 'featureDevChat'

/**
 * The name of the Amazon Q Feature Development feature.
 * @type {string}
 */
export const featureName = 'Amazon Q Developer Agent for software development'

/**
 * Maximum allowed size for file collection in bytes (200 MB).
 * @type {number}
 */
export const maxRepoSizeBytes = 200 * 1024 * 1024

/**
 * Generates the license text used in CodeWhisperer reference log.
 * @param {CodeReference} reference - The code reference object containing license and repository information.
 * @returns {string} The formatted license text with HTML links.
 */
export const referenceLogText = (reference: CodeReference) =>
    `[${new Date().toLocaleString()}] Accepted recommendation from Amazon Q. Code provided with reference under <a href="${LicenseUtil.getLicenseHtml(
        reference.licenseName
    )}" target="_blank">${reference.licenseName}</a> license from repository <a href="${
        reference.url
    }" target="_blank">${reference.repository}</a>.<br><br>`

/**
 * Generates the license text used in the file view
 * @param {CodeReference} reference - The code reference object
 * @returns {string} The formatted license text
 */
export const licenseText = (reference: CodeReference) =>
    `<a href="${LicenseUtil.getLicenseHtml(reference.licenseName)}" target="_blank">${
        reference.licenseName
    }</a> license from repository <a href="${reference.url}" target="_blank">${reference.repository}</a>`
