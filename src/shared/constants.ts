/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { NpmPackage } from './npmPackage'

export const extensionSettingsPrefix: string = 'aws'
export const regionSettingKey: string = 'region'
export const profileSettingKey: string = 'profile'

export const hostedFilesBaseUrl: string = 'https://d3rrggjwfhwld2.cloudfront.net/'
export const endpointsFileUrl: string = 'https://aws-toolkit-endpoints.s3.amazonaws.com/endpoints.json'
export const aboutCredentialsFileUrl: string = 'https://docs.aws.amazon.com/cli/latest/userguide/cli-config-files.html'
export const samAboutInstallUrl: string = 'https://aws.amazon.com/serverless/sam/'
// tslint:disable-next-line:max-line-length
export const vscodeMarketplaceUrl: string = 'https://marketplace.visualstudio.com/items?itemName=AmazonWebServices.aws-toolkit-vscode'
export const githubUrl: string = 'https://github.com/aws/aws-toolkit-vscode'
export const documentationUrl: string = 'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/welcome.html'

// URLs for samInitWizard
export const samInitDocUrl: string = 'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/create-sam.html'

const npmPackage = () => require('../../../package.json') as NpmPackage
export const pluginVersion = npmPackage().version
