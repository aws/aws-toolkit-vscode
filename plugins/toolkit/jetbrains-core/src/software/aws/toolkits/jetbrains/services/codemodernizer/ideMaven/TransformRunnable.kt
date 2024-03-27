// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.ideMaven

class TransformRunnable : Runnable {
    private var exitCode: Int? = null
    private var output: String? = null

    fun setExitCode(i: Int) {
        exitCode = i
    }

    override fun run() {
        // do nothing
    }

    fun isComplete(): Boolean = exitCode == 0

    fun isTerminated(): Boolean = exitCode == 130

    fun getOutput(): String? = output

    fun setOutput(s: String) {
        output = s
    }

    fun await() {
        while (exitCode == null) {
            // waiting mavenrunner building
            Thread.sleep(50)
        }
    }
}
