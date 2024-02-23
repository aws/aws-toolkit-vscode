// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway

import com.intellij.ide.BrowserUtil
import com.jetbrains.gateway.api.GatewayConnector
import com.jetbrains.gateway.api.GatewayConnectorDocumentation
import com.jetbrains.gateway.api.GatewayConnectorView
import com.jetbrains.gateway.api.GatewayRecentConnections
import com.jetbrains.rd.util.lifetime.Lifetime
import icons.AwsIcons
import software.aws.toolkits.jetbrains.core.credentials.sono.CodeCatalystCredentialManager
import software.aws.toolkits.jetbrains.gateway.welcomescreen.ExistingWorkspaces
import software.aws.toolkits.jetbrains.services.caws.CawsEndpoints
import software.aws.toolkits.resources.message
import java.awt.Component
import javax.swing.Icon
import javax.swing.JComponent

class CawsConnector : GatewayConnector {
    override val icon: Icon = AwsIcons.Logos.AWS_SMILE_LARGE

    override fun getTitle(): String = message("code.aws")

    override fun getDescription(): String = message("caws.create_workspace_description")

    override fun getActionText(): String = if (isSignedIn()) {
        message("caws.workspace.new")
    } else {
        message("caws.login")
    }

    override fun getConnectorId() = CONNECTOR_ID

    override fun getTitleAdornment(): JComponent? = null

    override fun createView(lifetime: Lifetime): GatewayConnectorView = object : GatewayConnectorView {
        override val component: JComponent
            get() {
                if (!isSignedIn()) {
                    CodeCatalystCredentialManager.getInstance().promptAuth()
                }

                return cawsWizard(lifetime)
            }
    }

    override fun getDocumentationAction() = GatewayConnectorDocumentation(true) {
        BrowserUtil.browse(CawsEndpoints.CAWS_DEV_ENV_MARKETING)
    }

    override fun getRecentConnections(setContentCallback: (Component) -> Unit): GatewayRecentConnections = object : GatewayRecentConnections {
        override val recentsIcon: Icon = AwsIcons.Logos.AWS_SMILE_SMALL

        override fun createRecentsView(lifetime: Lifetime): JComponent = ExistingWorkspaces(setContentCallback, lifetime).getComponent()

        override fun getRecentsTitle(): String = message("code.aws.workspaces")

        override fun updateRecentView() {}
    }

    private fun isSignedIn() = CodeCatalystCredentialManager
        .getInstance()
        .isConnected()

    companion object {
        const val CONNECTOR_ID = "aws.codecatalyst.connector"
    }
}
