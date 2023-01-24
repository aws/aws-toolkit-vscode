/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { isCloud9 } from './extensionUtilities'

export const extensionSettingsPrefix = 'aws'
export const regionSettingKey = 'region'
export const profileSettingKey = 'profile'
export const productName: string = 'aws-toolkit-vscode'

export const hostedFilesBaseUrl: string = 'https://d3rrggjwfhwld2.cloudfront.net/'
export const endpointsFileUrl: string = 'https://idetoolkits.amazonwebservices.com/endpoints.json'
export const aboutCredentialsFileUrl: string =
    'https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html'
export const samAboutInstallUrl: string = 'https://aws.amazon.com/serverless/sam/'
export const vscodeMarketplaceUrl: string =
    'https://marketplace.visualstudio.com/items?itemName=AmazonWebServices.aws-toolkit-vscode'
export const githubUrl: string = 'https://github.com/aws/aws-toolkit-vscode'
export const githubCreateIssueUrl = `${githubUrl}/issues/new/choose`
export const documentationUrl: string = isCloud9()
    ? 'https://docs.aws.amazon.com/cloud9/latest/user-guide/toolkit-welcome.html'
    : 'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/welcome.html'
/**
 * General help page to help users understand the different ways of connecting to AWS (AWS ID, IAM credentials, SSO).
 *
 * - alternative?: codecatalyst/latest/userguide/sign-up-create-resources.html
 */
export const authHelpUrl = 'https://docs.aws.amazon.com/general/latest/gr/differences-aws_builder_id.html'
export const credentialHelpUrl: string =
    'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/setup-credentials.html'
export const ssoCredentialsHelpUrl: string =
    'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/sso-credentials.html'

export const supportedLambdaRuntimesUrl: string =
    'https://docs.aws.amazon.com/lambda/latest/dg/runtime-support-policy.html'
export const createUrlForLambdaFunctionUrl = 'https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html'
// URLs for samInitWizard
export const samInitDocUrl: string = isCloud9()
    ? 'https://docs.aws.amazon.com/cloud9/latest/user-guide/serverless-apps-toolkit.html#sam-create'
    : 'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/serverless-apps.html#serverless-apps-create'
export const launchConfigDocUrl: string = isCloud9()
    ? 'https://docs.aws.amazon.com/cloud9/latest/user-guide/sam-debug-config-ref.html'
    : 'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/serverless-apps-run-debug-config-ref.html'
// URLs for samDeployWizard
export const samDeployDocUrl: string = isCloud9()
    ? 'https://docs.aws.amazon.com/cloud9/latest/user-guide/serverless-apps-toolkit.html#deploy-serverless-app'
    : 'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/serverless-apps.html#serverless-apps-deploy'
export const lambdaFunctionUrlConfigUrl: string = 'https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html'

// URLs for CDK
export const cdkProvideFeedbackUrl: string = `${githubUrl}/issues/new/choose`
export const cdkDocumentationUrl: string = 'https://docs.aws.amazon.com/console/toolkit-for-vscode/aws-cdk-apps'

// TODO : Add valid URL to be accessed from help button in the downloadCodeBindings wizard
export const eventBridgeSchemasDocUrl: string =
    'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/eventbridge-schemas.html'

// URLs for Step Functions
export const sfnCreateIamRoleUrl: string =
    'https://docs.aws.amazon.com/step-functions/latest/dg/procedure-create-iam-role.html'
export const sfnCreateStateMachineUrl: string =
    'https://docs.aws.amazon.com/step-functions/latest/apireference/API_CreateStateMachine.html'
export const sfnCreateStateMachineNameParamUrl: string =
    'https://docs.aws.amazon.com/step-functions/latest/apireference/API_CreateStateMachine.html#StepFunctions-CreateStateMachine-request-name'
export const sfnDeveloperGuideUrl: string = 'https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html'
export const sfnUpdateStateMachineUrl: string =
    'https://docs.aws.amazon.com/step-functions/latest/apireference/API_UpdateStateMachine.html'
export const sfnSupportedRegionsUrl: string =
    'https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html#supported-regions'

// URLs for SSM Documents
export const ssmDocumentPublishGuideUrl: string =
    'https://docs.aws.amazon.com/systems-manager/latest/userguide/create-ssm-doc.html'
export const ssmJson: string = 'ssm-json'
export const ssmYaml: string = 'ssm-yaml'

// URL for post-Create SAM App
export const debugNewSamAppUrl: string = isCloud9()
    ? 'https://docs.aws.amazon.com/cloud9/latest/user-guide/serverless-apps-toolkit.html#sam-run-debug'
    : 'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/serverless-apps.html#serverless-apps-debug'

// URLs for ECS Exec
export const ecsDocumentationUrl: string = 'https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html'
export const ecsExecToolkitGuideUrl: string =
    'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/ecs-exec.html'
export const ecsRequiredTaskPermissionsUrl: string =
    'https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html#ecs-exec-enabling-and-using'
export const ecsRequiredIamPermissionsUrl: string =
    'https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html#ecs-exec-best-practices-limit-access-execute-command'

/**
 * Moment format for rendering readable dates.
 *
 * Same format used in the S3 console, but it's also locale-aware.
 *
 * US: Jan 5, 2020 5:30:20 PM GMT-0700
 * GB: 5 Jan 2020 17:30:20 GMT+0100
 */
export const LOCALIZED_DATE_FORMAT = 'll LTS [GMT]ZZ' // eslint-disable-line @typescript-eslint/naming-convention

// moment().format() matches Insights console timestamp, e.g.: 2019-03-04T11:40:08.781-08:00
// TODO: Do we want this this verbose? Log stream just shows HH:mm:ss
export const INSIGHTS_TIMESTAMP_FORMAT = 'YYYY-MM-DDTHH:mm:ss.SSSZ' // eslint-disable-line @typescript-eslint/naming-convention

/**
 * URI scheme for CloudWatch Logs Virtual Documents
 */
export const CLOUDWATCH_LOGS_SCHEME = 'awsCloudWatchLogs' // eslint-disable-line @typescript-eslint/naming-convention
export const AWS_SCHEME = 'aws' // eslint-disable-line @typescript-eslint/naming-convention

export const lambdaPackageTypeImage = 'Image'

// URLs for App Runner
export const apprunnerConnectionHelpUrl =
    'https://docs.aws.amazon.com/apprunner/latest/dg/manage-create.html#manage-create.create.github'
export const apprunnerConfigHelpUrl = 'https://docs.aws.amazon.com/apprunner/latest/dg/manage-configure.html'
export const apprunnerRuntimeHelpUrl = 'https://docs.aws.amazon.com/apprunner/latest/dg/service-source-code.html'
export const apprunnerPricingUrl = 'https://aws.amazon.com/apprunner/pricing/'
export const apprunnerCreateServiceDocsUrl: string = isCloud9()
    ? 'https://docs.aws.amazon.com/cloud9/latest/user-guide/creating-service-apprunner.html'
    : 'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/creating-service-apprunner.html'

// URLs for S3
// TODO: update docs to add the file viewer feature
export const s3FileViewerHelpUrl = 'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/s3.html'
