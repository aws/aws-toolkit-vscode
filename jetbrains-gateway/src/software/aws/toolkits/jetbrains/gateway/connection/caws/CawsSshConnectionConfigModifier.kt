// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection.caws

import com.intellij.ssh.PromiscuousSshHostKeyVerifier
import com.intellij.ssh.config.SshConnectionConfig
import com.intellij.ssh.config.SshConnectionConfigService
import com.intellij.ssh.config.SshProxyConfig
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.sono.SonoCredentialManager

class CawsSshConnectionConfigModifier : SshConnectionConfigService.Modifier {
    override fun modify(initialHost: String, connectionConfig: SshConnectionConfig): SshConnectionConfig {
        if (!initialHost.startsWith(HOST_PREFIX)) {
            return connectionConfig
        }

        val (space, project, envId) = initialHost.substringAfter(HOST_PREFIX).split('/')
        val executor = CawsCommandExecutor(
            SonoCredentialManager.getInstance(null).getSettingsAndPromptAuth().awsClient(),
            ssmTarget = envId,
            spaceName = space,
            projectName = project
        )

        return connectionConfig.copy(
            proxyConfig = SshProxyConfig.Command(executor.proxyCommand().commandString),
            hostKeyVerifier = PromiscuousSshHostKeyVerifier
        )
    }

    companion object {
        const val HOST_PREFIX = "aws.codecatalyst:"
    }
}
