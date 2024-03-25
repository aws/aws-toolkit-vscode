// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.help

enum class HelpIds(shortId: String, val url: String) {
    // App Runner
    APPRUNNER_PAUSE_RESUME(
        "appRunnerPauseResume",
        "https://docs.aws.amazon.com/console/apprunner/manage-pause"
    ),
    APPRUNNER_CODE_CONFIG(
        "appRunnerCodeConfig",
        "https://docs.aws.amazon.com/console/apprunner/config-file"
    ),
    APPRUNNER_CONNECTIONS(
        "appRunnnerServiceConnections",
        "https://docs.aws.amazon.com/console/apprunner/manage-connections"
    ),

    // Explorer
    EXPLORER_WINDOW(
        "explorerWindow",
        "https://docs.aws.amazon.com/console/toolkit-for-jetbrains/aws-explorer"
    ),
    EXPLORER_CREDS_HELP(
        "explorerCredsHelp",
        "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/setup-credentials.html"
    ),

    // Lambda
    CREATE_FUNCTION_DIALOG(
        "createFunctionDialog",
        "https://docs.aws.amazon.com/console/toolkit-for-jetbrains/create-function-dialog"
    ),
    UPDATE_FUNCTION_CONFIGURATION_DIALOG(
        "updateFunctionConfigurationDialog",
        "https://docs.aws.amazon.com/console/toolkit-for-jetbrains/update-configuration-dialog"
    ),
    UPDATE_FUNCTION_CODE_DIALOG(
        "updateFunctionCodeDialog",
        "https://docs.aws.amazon.com/console/toolkit-for-jetbrains/update-code-dialog"
    ),

    // Serverless
    NEW_SERVERLESS_PROJECT_DIALOG(
        "newServerlessProjectDialog",
        "https://docs.aws.amazon.com/console/toolkit-for-jetbrains/new-project-dialog"
    ),
    DEPLOY_SERVERLESS_APPLICATION_DIALOG(
        "deployServerlessApplicationDialog",
        "https://docs.aws.amazon.com/console/toolkit-for-jetbrains/deploy-serverless-application-dialog"
    ),

    // Schema code download
    DOWNLOAD_CODE_FOR_SCHEMA_DIALOG(
        "downloadCodeForSchemaDialog",
        "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/eventbridge-schemas.html"
    ),

    // Schema search
    SCHEMA_SEARCH_DIALOG(
        "schemaSearchDialog",
        "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/eventbridge-schemas.html"
    ),

    // Others
    RUN_DEBUG_CONFIGURATIONS_DIALOG(
        "runDebugConfigurationsDialog",
        "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/run-debug-configurations-dialog.html"
    ),
    SETUP_CREDENTIALS(
        "setupCredentials",
        "https://docs.aws.amazon.com/console/toolkit-for-jetbrains/credentials"
    ),
    SAM_CLI_INSTALL(
        "sam.install",
        "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html"
    ),

    // RDS
    RDS_SETUP_IAM_AUTH(
        "rdsIamAuth",
        "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.html"
    ),

    // AWS CLI
    AWS_CLI_INSTALL(
        "awsCli.install",
        "https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html"
    ),

    // Ecs Exec
    ECS_EXEC_PERMISSIONS_REQUIRED(
        "ecsExecPermissions",
        "https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html#ecs-exec-enabling-and-using"
    ),

    // What is AWS Toolkit?
    AWS_TOOLKIT_GETTING_STARTED(
        "awsToolkitGettingStarted",
        "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/welcome.html"
    ),

    // CodeWhisperer
    CODEWHISPERER_TOKEN(
        "CodeWhispererToken",
        "https://aws.amazon.com/codewhisperer"
    ),

    // TODO: update this
    CODEWHISPERER_LOGIN_YES_NO(
        "CodeWhispererLoginYesNoDialog",
        "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/setup-credentials.html"
    ),

    // TODO: update this
    CODEWHISPERER_LOGIN_DIALOG(
        "CodeWhispererLoginDialog",
        "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/setup-credentials.html"
    ),

    // TODO: update this
    TOOLKIT_ADD_CONNECTIONS_DIALOG(
        "ToolkitAddConnectionsDialog",
        "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/setup-credentials.html"
    )
    ;

    val id = "aws.toolkit.$shortId"
}
