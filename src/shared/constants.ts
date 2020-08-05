/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const extensionSettingsPrefix: string = 'aws'
export const regionSettingKey: string = 'region'
export const profileSettingKey: string = 'profile'
export const mostRecentVersionKey: string = 'awsToolkitMostRecentVersion'

export const hostedFilesBaseUrl: string = 'https://d3rrggjwfhwld2.cloudfront.net/'
export const endpointsFileUrl: string = 'https://idetoolkits.amazonwebservices.com/endpoints.json'
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

// URLs for Step Functions
export const sfnCreateIamRoleUrl: string =
    'https://docs.aws.amazon.com/step-functions/latest/dg/procedure-create-iam-role.html'
export const sfnCreateStateMachineNameParamUrl: string =
    'https://docs.aws.amazon.com/step-functions/latest/apireference/API_CreateStateMachine.html#StepFunctions-CreateStateMachine-request-name'
export const sfnDeveloperGuideUrl: string = 'https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html'
export const sfnUpdateStateMachineUrl: string =
    'https://docs.aws.amazon.com/step-functions/latest/apireference/API_UpdateStateMachine.html'

/**
 * Moment format for rendering readable dates.
 *
 * Same format used in the S3 console, but it's also locale-aware.
 *
 * US: Jan 5, 2020 5:30:20 PM GMT-0700
 * GB: 5 Jan 2020 17:30:20 GMT+0100
 */
export const LOCALIZED_DATE_FORMAT = 'll LTS [GMT]ZZ'

/**
 * URI scheme for CloudWatch Logs Virtual Documents
 */
export const CLOUDWATCH_LOGS_SCHEME = 'awsCloudWatchLogs'
