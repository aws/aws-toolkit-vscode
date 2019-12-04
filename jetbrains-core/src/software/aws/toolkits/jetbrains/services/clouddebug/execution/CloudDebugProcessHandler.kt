// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.execution

import com.intellij.execution.process.ProcessHandler
import java.io.OutputStream

class CloudDebugProcessHandler(private val context: Context) : ProcessHandler() {
    override fun getProcessInput(): OutputStream? = null

    override fun detachIsDefault() = false

    override fun detachProcessImpl() {
        destroyProcessImpl()
    }

    override fun destroyProcessImpl() {
        context.cancel()
    }

    public override fun notifyProcessTerminated(exitCode: Int) {
        super.notifyProcessTerminated(exitCode)
    }
}
