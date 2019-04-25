// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.help

enum class HelpIds(shortId: String, val url: String) {
    EXPLORER_WINDOW("explorerWindow", "https://docs.aws.amazon.com/console/toolkit-for-jetbrains/aws-explorer"),
    // Lambda
    CREATE_FUNCTION_DIALOG("createFunctionDialog", "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/create-function-dialog.html"),
    UPDATE_FUNCTION_CONFIGURATION_DIALOG("updateFunctionConfigurationDialog", "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/update-configuration-dialog.html"),
    UPDATE_FUNCTION_CODE_DIALOG("updateFunctionCodeDialog", "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/update-code-dialog.html"),
    // Serverless
    NEW_SERVERLESS_PROJECT_DIALOG("newServerlessProjectDialog", "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/new-project-dialog.html"),
    RUN_DEBUG_CONFIGURATIONS_DIALOG("runDebugConfigurationsDialog", "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/run-debug-configurations-dialog.html"),
    DEPLOY_SERVERLESS_APPLICATION_DIALOG("deployServerlessApplicationDialog", "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/deploy-serverless-application-dialog.html"),
    ;

    val id = "aws.toolkit.$shortId"
}