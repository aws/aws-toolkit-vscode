// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.gettingstarted

import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.project.Project
import com.intellij.ui.jcef.JBCefApp
import software.aws.toolkits.jetbrains.core.credentials.sono.CODECATALYST_SCOPES
import software.aws.toolkits.jetbrains.core.explorer.showWebview
import software.aws.toolkits.jetbrains.core.explorer.webview.ToolkitWebviewPanel
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.SourceOfEntry
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.getConnectionCount
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.getEnabledConnections
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.getSourceOfEntry
import software.aws.toolkits.jetbrains.core.webview.BrowserState
import software.aws.toolkits.jetbrains.services.caws.CawsEndpoints.CAWS_DOCS
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AuthTelemetry
import software.aws.toolkits.telemetry.FeatureId
import software.aws.toolkits.telemetry.Result

fun requestCredentialsForCodeCatalyst(
    project: Project?,
    popupBuilderIdTab: Boolean = true,
    initialConnectionCount: Int = getConnectionCount(),
    initialAuthConnections: String = getEnabledConnections(
        project
    ),
    isFirstInstance: Boolean = false,
    connectionInitiatedFromExplorer: Boolean = false
): Boolean? {
    if (JBCefApp.isSupported() && project != null) {
        ToolkitWebviewPanel.getInstance(project).browser?.prepareBrowser(BrowserState(FeatureId.Codecatalyst, true)) // TODO: consume data
        showWebview(project)

        return null
    }

    val authenticationDialog = when (ApplicationInfo.getInstance().build.productCode) {
        "GW" -> {
            GatewaySetupAuthenticationDialog(
                project,
                state = GatewaySetupAuthenticationDialogState().also {
                    it.selectedTab.set(GatewaySetupAuthenticationTabs.BUILDER_ID)
                },
                tabSettings = emptyMap(),
                scopes = CODECATALYST_SCOPES,
                promptForIdcPermissionSet = false
            )
        }

        else -> {
            SetupAuthenticationDialog(
                project,
                state = SetupAuthenticationDialogState().also {
                    if (popupBuilderIdTab) {
                        it.selectedTab.set(SetupAuthenticationTabs.BUILDER_ID)
                    }
                },
                tabSettings = mapOf(
                    SetupAuthenticationTabs.IAM_LONG_LIVED to AuthenticationTabSettings(
                        disabled = true,
                        notice = SetupAuthenticationNotice(
                            SetupAuthenticationNotice.NoticeType.ERROR,
                            message("gettingstarted.setup.codecatalyst.no_iam"),
                            CAWS_DOCS
                        )
                    )
                ),
                scopes = CODECATALYST_SCOPES,
                promptForIdcPermissionSet = false,
                sourceOfEntry = SourceOfEntry.CODECATALYST,
                featureId = FeatureId.Codecatalyst,
                isFirstInstance = isFirstInstance,
                connectionInitiatedFromExplorer = connectionInitiatedFromExplorer
            )
        }
    }

    val isAuthenticationSuccessful = authenticationDialog.showAndGet()
    if (isAuthenticationSuccessful) {
        AuthTelemetry.addConnection(
            project,
            source = getSourceOfEntry(SourceOfEntry.CODECATALYST, isFirstInstance, connectionInitiatedFromExplorer),
            featureId = FeatureId.Codecatalyst,
            credentialSourceId = authenticationDialog.authType,
            isAggregated = true,
            attempts = authenticationDialog.attempts + 1,
            result = Result.Succeeded
        )
        AuthTelemetry.addedConnections(
            project,
            source = getSourceOfEntry(SourceOfEntry.CODECATALYST, isFirstInstance, connectionInitiatedFromExplorer),
            authConnectionsCount = initialConnectionCount,
            newAuthConnectionsCount = getConnectionCount() - initialConnectionCount,
            enabledAuthConnections = initialAuthConnections,
            newEnabledAuthConnections = getEnabledConnections(project),
            attempts = authenticationDialog.attempts + 1,
            result = Result.Succeeded
        )
    } else {
        AuthTelemetry.addConnection(
            project,
            source = getSourceOfEntry(SourceOfEntry.CODECATALYST, isFirstInstance, connectionInitiatedFromExplorer),
            featureId = FeatureId.Codecatalyst,
            credentialSourceId = authenticationDialog.authType,
            isAggregated = false,
            attempts = authenticationDialog.attempts + 1,
            result = Result.Cancelled,
        )
    }
    return isAuthenticationSuccessful
}

fun requestCredentialsForExplorer(
    project: Project,
    initialConnectionCount: Int = getConnectionCount(),
    initialAuthConnections: String = getEnabledConnections(
        project
    ),
    isFirstInstance: Boolean = false,
    connectionInitiatedFromExplorer: Boolean = false
): Boolean? {
    if (JBCefApp.isSupported()) {
        ToolkitWebviewPanel.getInstance(project).browser?.prepareBrowser(BrowserState(FeatureId.AwsExplorer, true)) // TODO: consume data
        showWebview(project)
        return null
    }

    val authenticationDialog = SetupAuthenticationDialog(
        project,
        tabSettings = mapOf(
            SetupAuthenticationTabs.BUILDER_ID to AuthenticationTabSettings(
                disabled = true,
                notice = SetupAuthenticationNotice(
                    SetupAuthenticationNotice.NoticeType.ERROR,
                    message("gettingstarted.setup.explorer.no_builder_id"),
                    "https://docs.aws.amazon.com/signin/latest/userguide/differences-aws_builder_id.html"
                )
            )
        ),
        promptForIdcPermissionSet = true,
        sourceOfEntry = SourceOfEntry.RESOURCE_EXPLORER,
        featureId = FeatureId.AwsExplorer,
        isFirstInstance = isFirstInstance,
        connectionInitiatedFromExplorer = connectionInitiatedFromExplorer
    )
    val isAuthSuccessful = authenticationDialog.showAndGet()
    if (isAuthSuccessful) {
        AuthTelemetry.addConnection(
            project,
            source = getSourceOfEntry(SourceOfEntry.RESOURCE_EXPLORER, isFirstInstance, connectionInitiatedFromExplorer),
            featureId = FeatureId.AwsExplorer,
            credentialSourceId = authenticationDialog.authType,
            isAggregated = true,
            attempts = authenticationDialog.attempts + 1,
            result = Result.Succeeded
        )
        AuthTelemetry.addedConnections(
            project,
            source = getSourceOfEntry(SourceOfEntry.RESOURCE_EXPLORER, isFirstInstance, connectionInitiatedFromExplorer),
            authConnectionsCount = initialConnectionCount,
            newAuthConnectionsCount = getConnectionCount() - initialConnectionCount,
            enabledAuthConnections = initialAuthConnections,
            newEnabledAuthConnections = getEnabledConnections(project),
            attempts = authenticationDialog.attempts + 1,
            result = Result.Succeeded
        )
    } else {
        AuthTelemetry.addConnection(
            project,
            source = getSourceOfEntry(SourceOfEntry.RESOURCE_EXPLORER, isFirstInstance, connectionInitiatedFromExplorer),
            featureId = FeatureId.AwsExplorer,
            credentialSourceId = authenticationDialog.authType,
            isAggregated = false,
            attempts = authenticationDialog.attempts + 1,
            result = Result.Cancelled,
        )
    }
    return isAuthSuccessful
}
