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

export const featureName = 'Amazon Q Developer Agent for software development'

export const generateDevFilePrompt =
    "generate a devfile in my repository. Note that you should only use devfile version 2.0.0 and the only supported commands are install, build and test (are all optional). so you may have to bundle some commands together using '&&'. also you can use ”public.ecr.aws/aws-mde/universal-image:latest” as universal image if you aren’t sure which image to use. here is an example for a node repository (but don't assume it's always a node project. look at the existing repository structure before generating the devfile): schemaVersion: 2.0.0 components: - name: dev container: image: public.ecr.aws/aws-mde/universal-image:latest commands: - id: install exec: component: dev commandLine: ”npm install” - id: build exec: component: dev commandLine: ”npm run build” - id: test exec: component: dev commandLine: ”npm run test”"

// Max allowed size for file collection
export const maxRepoSizeBytes = 200 * 1024 * 1024

export const startCodeGenClientErrorMessages = ['Improperly formed request', 'Resource not found']
export const startTaskAssistLimitReachedMessage = 'StartTaskAssistCodeGeneration reached for this month.'
export const clientErrorMessages = [
    'The folder you chose did not contain any source files in a supported language. Choose another folder and try again.',
]

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
