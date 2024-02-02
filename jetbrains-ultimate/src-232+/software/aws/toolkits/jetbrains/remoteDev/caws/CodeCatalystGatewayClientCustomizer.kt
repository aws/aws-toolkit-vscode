// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.remoteDev.caws

import com.intellij.openapi.extensions.ExtensionNotApplicableException
import com.jetbrains.rdserver.unattendedHost.customization.DefaultGatewayExitCustomizationProvider
import com.jetbrains.rdserver.unattendedHost.customization.GatewayClientCustomizationProvider
import com.jetbrains.rdserver.unattendedHost.customization.GatewayExitCustomizationProvider
import com.jetbrains.rdserver.unattendedHost.customization.controlCenter.GatewayControlCenterProvider
import com.jetbrains.rdserver.unattendedHost.customization.controlCenter.GatewayHostnameDisplayKind
import icons.AwsIcons
import software.aws.toolkits.jetbrains.utils.isCodeCatalystDevEnv
import software.aws.toolkits.resources.message

class CodeCatalystGatewayClientCustomizer : GatewayClientCustomizationProvider {
    init {
        if (!isCodeCatalystDevEnv()) {
            throw ExtensionNotApplicableException.create()
        }
    }

    override val controlCenter: GatewayControlCenterProvider = object : GatewayControlCenterProvider {
        override fun getHostnameDisplayKind() = GatewayHostnameDisplayKind.ShowHostnameOnNavbar
        override fun getHostnameLong() = title
        override fun getHostnameShort() = title
    }

    override val icon = AwsIcons.Logos.CODE_CATALYST_SMALL
    override val title = message("caws.workspace.backend.title")

    override val exitCustomization: GatewayExitCustomizationProvider = object : GatewayExitCustomizationProvider by DefaultGatewayExitCustomizationProvider() {
        override val isEnabled: Boolean = false
    }
}
