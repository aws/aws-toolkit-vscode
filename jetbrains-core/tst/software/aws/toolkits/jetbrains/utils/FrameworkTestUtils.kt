// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import org.jetbrains.ide.BuiltInServerManager
import java.util.concurrent.atomic.AtomicReference

object FrameworkTestUtils {
    private val serverStarted = AtomicReference(false)

    // Make sure the built in server is started. This is not done in unit test mode, so it must be done
    // for several integration tests in ultimate/gateway
    fun ensureBuiltInServerStarted() {
        serverStarted.getAndUpdate { started ->
            if (!started) {
                BuiltInServerManager.getInstance().waitForStart()
            }
            true
        }
    }
}
