// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import org.jetbrains.ide.BuiltInServerManager
import java.util.concurrent.atomic.AtomicReference

object WebStormTestUtils {
    private val serverStarted = AtomicReference<Boolean>(false)

    // Make sure the built in sever is started. This is not done in unit test mode, so it must be done
    // for several integration tests
    fun ensureBuiltInServerStarted() {
        serverStarted.getAndUpdate { started ->
            if (!started) {
                BuiltInServerManager.getInstance().waitForStart()
            }
            true
        }
    }
}
