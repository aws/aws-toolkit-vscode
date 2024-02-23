// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection.caws

import software.amazon.awssdk.services.codecatalyst.CodeCatalystClient
import software.amazon.awssdk.services.codecatalyst.model.DevEnvironmentSessionType
import software.amazon.awssdk.services.codecatalyst.model.StartDevEnvironmentSessionRequest
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.gateway.connection.AbstractSsmCommandExecutor
import software.aws.toolkits.jetbrains.gateway.connection.StartSessionResponse

class CawsCommandExecutor(
    private val cawsClient: CodeCatalystClient,
    ssmTarget: String,
    private val spaceName: String,
    private val projectName: String
) : AbstractSsmCommandExecutor(AwsRegion.GLOBAL, ssmTarget) {
    override fun startSsh(): StartSessionResponse =
        startSession {
            it.sessionConfiguration { session ->
                session.sessionType(DevEnvironmentSessionType.SSH)
            }
        }

    override fun startSsm(exe: String, vararg args: String): StartSessionResponse =
        startSession {
            it.sessionConfiguration { session ->
                session.sessionType(DevEnvironmentSessionType.SSM)
                session.executeCommandSessionConfiguration { command ->
                    command.command(exe)
                    command.arguments(*args)
                }
            }
        }

    private fun startSession(mutator: (StartDevEnvironmentSessionRequest.Builder) -> Unit): StartSessionResponse {
        val session = cawsClient.startDevEnvironmentSession {
            it.spaceName(spaceName)
            it.projectName(projectName)
            it.id(ssmTarget)

            mutator(it)
        }

        return StartSessionResponse(
            sessionId = session.id(),
            streamUrl = session.accessDetails().streamUrl(),
            tokenValue = session.accessDetails().tokenValue()
        )
    }
}
