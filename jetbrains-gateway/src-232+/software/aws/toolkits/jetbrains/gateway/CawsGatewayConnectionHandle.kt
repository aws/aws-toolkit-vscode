// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.gateway

import com.jetbrains.gateway.api.DefaultCustomConnectionFrameComponentProvider
import com.jetbrains.gateway.api.GatewayConnectionHandle
import com.jetbrains.rd.util.lifetime.Lifetime
import software.aws.toolkits.resources.message
import javax.swing.JComponent

class CawsGatewayConnectionHandle(
    lifetime: Lifetime,
    private val envId: String,
    private val componentProvider: (GatewayConnectionHandle) -> JComponent
) : GatewayConnectionHandle(lifetime) {
    // framework does not call componentProvider in test mode
    private val component = componentProvider(this)

    override fun customComponentProvider(lifetime: Lifetime) = DefaultCustomConnectionFrameComponentProvider(getTitle()) {
        component
    }

    override fun getTitle() = message("caws.connection_progress_panel_title", envId)

    override fun hideToTrayOnStart() = true
}
