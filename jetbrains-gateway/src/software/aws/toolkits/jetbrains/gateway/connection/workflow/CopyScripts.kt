// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection.workflow

import com.intellij.execution.configurations.GeneralCommandLine
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.gateway.connection.caws.CawsCommandExecutor
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.resources.message
import java.util.Base64
import kotlin.io.path.readBytes

class CopyScripts(
    private val remoteScriptPath: String,
    private val remoteCommandExecutor: CawsCommandExecutor,
) : PtyCliBasedStep() {
    override val stepName: String = message("gateway.connection.workflow.copy_scripts")

    override fun constructCommandLine(context: Context): GeneralCommandLine =
        remoteCommandExecutor.buildSshCommand {
            it.addSshOption("-e", "none")
            val b64 = Base64.getEncoder().encodeToString(SCRIPTS.readBytes())
            it.addToRemoteCommand(
                "set -x; mkdir -p \"$remoteScriptPath\" && cd \"$remoteScriptPath\" && (echo -n '$b64' | base64 -d | tar xvvzf -)"
            )
        }

    private companion object {
        private val SCRIPTS = AwsToolkit.pluginPath().resolve("gateway-resources").resolve("scripts.tar.gz")
    }
}
