// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package icons

import com.intellij.openapi.util.IconLoader
import javax.swing.Icon

/**
 * Lives in `icons` package due to that is how [com.intellij.openapi.util.IconLoader.getReflectiveIcon] works
 */
object AwsGatewayIcons {
    @JvmField val GATEWAY_RUNNING = load("/icons/gateway/running.svg") // 16x16

    @JvmField val GATEWAY_STOPPED = load("/icons/gateway/stopped.svg") // 16x16

    private fun load(path: String): Icon = IconLoader.getIcon(path, AwsGatewayIcons::class.java)
}
