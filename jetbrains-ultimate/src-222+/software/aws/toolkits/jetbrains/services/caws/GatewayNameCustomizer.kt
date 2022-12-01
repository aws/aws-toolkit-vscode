// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws

import com.intellij.openapi.extensions.ExtensionNotApplicableException
import com.jetbrains.rdserver.unattendedHost.customization.GatewayClientCustomizationProvider
import com.jetbrains.rdserver.unattendedHost.customization.controlCenter.GatewayControlCenterProvider
import com.jetbrains.rdserver.unattendedHost.customization.controlCenter.GatewayHostnameDisplayKind
import icons.AwsIcons
import software.aws.toolkits.resources.message

class GatewayNameCustomizer : GatewayClientCustomizationProvider {
    init {
        if (System.getenv(CawsConstants.CAWS_ENV_ID_VAR) == null) {
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
}
