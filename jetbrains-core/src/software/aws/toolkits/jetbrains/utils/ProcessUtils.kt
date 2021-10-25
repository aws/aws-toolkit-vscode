// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.execution.process.ProcessOutput
import org.slf4j.Logger
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.info

fun ProcessOutput.checkSuccess(logger: Logger): Boolean {
    val code = exitCode
    if (code == 0 && !isTimeout) {
        return true
    }
    logger.info { if (isTimeout) "Timed out" else "Exit code $code" }
    logger.debug { stderr.takeIf { it.isNotEmpty() } ?: stdout }

    return false
}
