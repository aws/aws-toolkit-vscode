// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.ideMaven

class TransformRunnable : Runnable {
    private var isComplete: Int? = null
    private var output: String? = null

    fun exitCode(i: Int) {
        isComplete = i
    }

    override fun run() {
        // do nothing
    }

    fun isComplete(): Int? = isComplete
    fun getOutput(): String? = output

    fun setOutput(s: String) {
        output = s
    }

    fun await() {
        while (isComplete() == null) {
            // waiting mavenrunner building
            Thread.sleep(50)
        }
    }
}
