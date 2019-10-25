// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.help

enum class HelpIds(shortId: String, val url: String) {
    EXPLORER_WINDOW(
        "explorerWindow",
        "https://docs.aws.amazon.com/console/toolkit-for-jetbrains/aws-explorer"
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
    RUN_DEBUG_CONFIGURATIONS_DIALOG(
        "runDebugConfigurationsDialog",
        "https://docs.aws.amazon.com/console/toolkit-for-jetbrains/run-debug-configurations-dialog"
    ),
    DEPLOY_SERVERLESS_APPLICATION_DIALOG(
        "deployServerlessApplicationDialog",
        "https://docs.aws.amazon.com/console/toolkit-for-jetbrains/deploy-serverless-application-dialog"
    ),
    // Others
    SETUP_CREDENTIALS(
        "setupCredentials",
        "https://docs.aws.amazon.com/console/toolkit-for-jetbrains/credentials"
    ),
    ;

    val id = "aws.toolkit.$shortId"
}
