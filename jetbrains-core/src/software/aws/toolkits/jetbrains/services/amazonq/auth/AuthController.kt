// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.auth

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.ActiveConnection
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.ActiveConnectionType
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.BearerTokenFeatureSet
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.checkBearerConnectionValidity
import software.aws.toolkits.jetbrains.core.gettingstarted.reauthenticateWithQ
import software.aws.toolkits.jetbrains.core.gettingstarted.requestCredentialsForQ
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.UiTelemetry

class AuthController {
    /**
     * Check the state of the Q connection. If the connection is valid then null is returned, otherwise it returns a [AuthNeededState]
     * holding a message indicating the problem and what type of authentication is needed to resolve.
     */
    fun getAuthNeededStates(project: Project): AuthNeededStates {
        val connectionState = checkBearerConnectionValidity(project, BearerTokenFeatureSet.Q)
        val codeWhispererState = checkBearerConnectionValidity(project, BearerTokenFeatureSet.CODEWHISPERER)

        // CW chat is enabled for Builder and IDC users, Amazon Q is only valid for IDC users
        return AuthNeededStates(
            chat = getAuthNeededState(connectionState, codeWhispererState),
            amazonQ = getAuthNeededState(connectionState, codeWhispererState, true)
        )
    }

    private fun getAuthNeededState(
        amazonqConnectionState: ActiveConnection,
        codeWhispereConnectionState: ActiveConnection,
        onlyIamIdcConnection: Boolean = false
    ): AuthNeededState? =
        when (amazonqConnectionState) {
            ActiveConnection.NotConnected -> {
                if (codeWhispereConnectionState == ActiveConnection.NotConnected) {
                    AuthNeededState(
                        message = message("q.connection.disconnected"),
                        authType = AuthFollowUpType.FullAuth,
                    )
                } else {
                    // There is a connection for codewhisperer, but it's not valid for Q
                    AuthNeededState(
                        message = message("q.connection.need_scopes"),
                        authType = AuthFollowUpType.MissingScopes,
                    )
                }
            }

            is ActiveConnection.ValidBearer -> {
                if (onlyIamIdcConnection && amazonqConnectionState.connectionType != ActiveConnectionType.IAM_IDC) {
                    AuthNeededState(
                        message = message("q.connection.need_scopes"),
                        authType = AuthFollowUpType.Unsupported,
                    )
                } else {
                    null
                }
            }

            is ActiveConnection.ExpiredBearer -> AuthNeededState(
                message = message("q.connection.expired"),
                authType = AuthFollowUpType.ReAuth,
            )
            // Not a bearer connection. This should not happen, but if it does, we treat it as a full-auth scenario
            else -> {
                logger.warn { "Received non-bearer connection for Q" }
                AuthNeededState(
                    message = message("q.connection.invalid"),
                    authType = AuthFollowUpType.FullAuth,
                )
            }
        }

    fun handleAuth(project: Project, type: AuthFollowUpType) {
        when (type) {
            AuthFollowUpType.MissingScopes,
            AuthFollowUpType.Unsupported,
            AuthFollowUpType.FullAuth -> runInEdt {
                UiTelemetry.click(project, "amazonq_chatAuthenticate")
                requestCredentialsForQ(project, connectionInitiatedFromQChatPanel = true)
            }

            AuthFollowUpType.ReAuth,
            -> runInEdt {
                reauthenticateWithQ(project)
            }
        }
    }

    companion object {
        private val logger = getLogger<AuthController>()
    }
}
