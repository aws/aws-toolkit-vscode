/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const extensionSettingsPrefix: string = 'aws'
export const regionSettingKey: string = 'region'
export const profileSettingKey: string = 'profile'
export const mostRecentVersionKey: string = 'awsToolkitMostRecentVersion'

export const hostedFilesBaseUrl: string = 'https://d3rrggjwfhwld2.cloudfront.net/'
export const endpointsFileUrl: string = 'https://aws-toolkit-endpoints.s3.amazonaws.com/endpoints.json'
export const aboutCredentialsFileUrl: string = 'https://docs.aws.amazon.com/cli/latest/userguide/cli-config-files.html'
export const samAboutInstallUrl: string = 'https://aws.amazon.com/serverless/sam/'
// tslint:disable-next-line:max-line-length
export const vscodeMarketplaceUrl: string =
    'https://marketplace.visualstudio.com/items?itemName=AmazonWebServices.aws-toolkit-vscode'
export const githubUrl: string = 'https://github.com/aws/aws-toolkit-vscode'
export const githubCreateIssueUrl = `${githubUrl}/issues/new/choose`
export const documentationUrl: string = 'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/welcome.html'
// tslint:disable-next-line:max-line-length
export const credentialHelpUrl: string =
    'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/setup-credentials.html'

// URLs for samInitWizard
export const samInitDocUrl: string = 'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/create-sam.html'
// URLs for samDeployWizard
// tslint:disable-next-line:max-line-length
export const samDeployDocUrl: string =
    'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/deploy-serverless-app.html'

// URLs for CDK
export const cdkProvideFeedbackUrl: string = `${githubUrl}/issues/new/choose`
export const cdkDocumentationUrl: string = 'https://docs.aws.amazon.com/console/toolkit-for-vscode/aws-cdk-apps'

// This is a hack to get around webpack messing everything up in unit test mode, it's also a very obvious
// bad version if something goes wrong while building it
let pluginVersion = 'testPluginVersion'
try {
    pluginVersion = PLUGINVERSION
} catch (e) {}

export { pluginVersion }
// TODO : Add valid URL to be accessed from help button in the downloadCodeBindings wizard
export const eventBridgeSchemasDocUrl: string =
    'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/eventbridge-schemas.html'
