// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection.workflow

import com.jetbrains.gateway.api.GatewayConnectionHandle
import com.jetbrains.rd.util.lifetime.Lifetime
import software.aws.toolkits.jetbrains.gateway.connection.AbstractSsmCommandExecutor
import software.aws.toolkits.jetbrains.gateway.connection.IDE_BACKEND_DIR
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.Step
import software.aws.toolkits.jetbrains.utils.execution.steps.StepEmitter

class PatchBackend(
    private val gatewayHandle: GatewayConnectionHandle,
    private val executor: AbstractSsmCommandExecutor,
    private val lifetime: Lifetime
) : Step() {
    override val stepName: String = "Patch Backend Starter"

    override fun execute(context: Context, stepEmitter: StepEmitter, ignoreCancellation: Boolean) {
        executor.executeSshCommand {
            it.addToRemoteCommand(
                """
                grep -q "agentlib:jdwp=transport=dt_socket" $IDE_BACKEND_DIR/plugins/remote-dev-server/bin/launcher.sh || sed -i.bak '/make -Xmx even bigger/aprintf "\\n-agentlib:jdwp=transport=dt_socket,server=y,suspend=n\\n" >> "${'$'}TEMP_VM_OPTIONS"' $IDE_BACKEND_DIR/plugins/remote-dev-server/bin/launcher.sh
                """.trimIndent()
            )
        }
    }
}
