/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodeReference } from '../amazonq/webview/ui/connector'
import { LicenseUtil } from '../codewhisperer/util/licenseUtil'

// The Scheme name of the virtual documents.
export const featureDevScheme = 'aws-featureDev'

// For uniquely identifiying which chat messages should be routed to FeatureDev
export const featureDevChat = 'featureDevChat'

export const featureName = 'Amazon Q feature development'

// License text that's used in codewhisperer reference log
export const referenceLogText = (reference: CodeReference) =>
    `[${new Date().toLocaleString()}] Accepted recommendation from Amazon Q. Code provided with reference under <a href="${LicenseUtil.getLicenseHtml(
        reference.licenseName
    )}" target="_blank">${reference.licenseName}</a> license from repository <a href="${
        reference.url
    }" target="_blank">${reference.repository}</a>.<br><br>`

// License text that's used in the file view
export const licenseText = (reference: CodeReference) =>
    `<a href="${LicenseUtil.getLicenseHtml(reference.licenseName)}" target="_blank">${
        reference.licenseName
    }</a> license from repository <a href="${reference.url}" target="_blank">${reference.repository}</a>`
